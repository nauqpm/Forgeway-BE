import { Types } from 'mongoose';
import {
  ChannelOrganizationBackfillReport,
  runChannelOrganizationBackfill,
} from './backfill-channel-organization';

type Document = Record<string, any> & { _id: Types.ObjectId };

const sameId = (left: unknown, right: unknown) =>
  String(left) === String(right);

const matches = (document: Document, query: Record<string, any>): boolean =>
  Object.entries(query).every(([field, expected]) => {
    if (field === '$or') {
      return expected.some((condition: Record<string, any>) =>
        matches(document, condition),
      );
    }
    const actual = document[field];
    if (expected && typeof expected === 'object' && '$gt' in expected) {
      return actual > expected.$gt;
    }
    if (expected && typeof expected === 'object' && '$in' in expected) {
      return expected.$in.some((value: unknown) => sameId(actual, value));
    }
    if (expected && typeof expected === 'object' && '$exists' in expected) {
      return (actual !== undefined) === expected.$exists;
    }
    return sameId(actual, expected);
  });

const makeFixture = ({
  channels = [],
  workspaces = [],
  memberships = [],
}: {
  channels?: Document[];
  workspaces?: Document[];
  memberships?: Document[];
}) => {
  const writes = jest.fn();
  const collection = (documents: Document[], writable = false) => ({
    find: jest.fn((query: Record<string, any>) => {
      let results = documents.filter(document => matches(document, query));
      const cursor = {
        sort: jest.fn(() => cursor),
        limit: jest.fn((limit: number) => {
          results = results.slice(0, limit);
          return cursor;
        }),
        toArray: jest.fn(async () => results),
      };
      return cursor;
    }),
    findOne: jest.fn(
      async (query: Record<string, any>) =>
        documents.find(document => matches(document, query)) ?? null,
    ),
    updateOne: jest.fn(
      async (
        query: Record<string, any>,
        update: {
          $set?: Record<string, unknown>;
        },
      ) => {
        if (!writable) {
          throw new Error('Unexpected write');
        }
        writes(query, update);
        const document = documents.find(item => matches(item, query));
        if (!document) {
          return { modifiedCount: 0 };
        }
        Object.assign(document, update.$set);
        return { modifiedCount: 1 };
      },
    ),
  });
  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'channels') return collection(channels, true);
      if (name === 'workspaces') return collection(workspaces);
      if (name === 'organizationmemberships') {
        return collection(memberships);
      }
      throw new Error(`Unexpected collection: ${name}`);
    }),
  };

  return { db, channels, writes };
};

const zeroReport = (): ChannelOrganizationBackfillReport => ({
  processed: 0,
  backfilled: 0,
  quarantined: {
    total: 0,
    'no-shared-org': 0,
    'ambiguous-shared-org': 0,
    'invalid-participant-count': 0,
  },
  skipped: { workspaceNotBackfilled: 0 },
  writes: 0,
});

describe('channel organization backfill', () => {
  it('backfills a workspace channel from its Workspace organizationId', async () => {
    const workspaceId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const channel: Document = {
      _id: new Types.ObjectId(),
      type: 'general',
      workspaceId,
      organizationId: null,
    };
    const { db } = makeFixture({
      channels: [channel],
      workspaces: [{ _id: workspaceId, organizationId }],
    });

    const report = await runChannelOrganizationBackfill(db as any, {
      apply: true,
    });

    expect(channel.organizationId).toEqual(organizationId);
    expect(report).toEqual({
      ...zeroReport(),
      processed: 1,
      backfilled: 1,
      writes: 1,
    });
  });

  it('skips a workspace channel when its Workspace has no organizationId', async () => {
    const workspaceId = new Types.ObjectId();
    const channel: Document = {
      _id: new Types.ObjectId(),
      type: 'announcement',
      workspaceId,
      organizationId: null,
    };
    const { db, writes } = makeFixture({
      channels: [channel],
      workspaces: [{ _id: workspaceId, organizationId: null }],
    });

    const report = await runChannelOrganizationBackfill(db as any, {
      apply: true,
    });

    expect(channel.organizationId).toBeNull();
    expect(report.skipped.workspaceNotBackfilled).toBe(1);
    expect(writes).not.toHaveBeenCalled();
  });

  it('backfills a DM with its shared active Organization and deterministic key', async () => {
    const firstUserId = new Types.ObjectId();
    const secondUserId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const channel: Document = {
      _id: new Types.ObjectId(),
      type: 'dm',
      organizationId: null,
      dmParticipantKey: null,
      members: [secondUserId, firstUserId],
    };
    const { db } = makeFixture({
      channels: [channel],
      memberships: [
        {
          _id: new Types.ObjectId(),
          userId: firstUserId,
          organizationId,
          status: 'active',
          expiresAt: null,
        },
        {
          _id: new Types.ObjectId(),
          userId: secondUserId,
          organizationId,
          status: 'active',
          expiresAt: null,
        },
      ],
    });

    const report = await runChannelOrganizationBackfill(db as any, {
      apply: true,
    });

    expect(channel).toMatchObject({
      organizationId,
      dmParticipantKey: [firstUserId, secondUserId]
        .map(String)
        .sort()
        .join(':'),
    });
    expect(report.backfilled).toBe(1);
  });

  it('quarantines a DM with no shared active Organization without changing members', async () => {
    const members = [new Types.ObjectId(), new Types.ObjectId()];
    const originalMembers = [...members];
    const channel: Document = {
      _id: new Types.ObjectId(),
      type: 'dm',
      organizationId: null,
      members,
    };
    const { db } = makeFixture({ channels: [channel] });

    const report = await runChannelOrganizationBackfill(db as any, {
      apply: true,
    });

    expect(channel.members).toEqual(originalMembers);
    expect(channel.organizationScopeQuarantineReason).toBe('no-shared-org');
    expect(report.quarantined).toMatchObject({
      total: 1,
      'no-shared-org': 1,
    });
  });

  it('quarantines a DM with multiple shared active Organizations as ambiguous', async () => {
    const members = [new Types.ObjectId(), new Types.ObjectId()];
    const organizations = [new Types.ObjectId(), new Types.ObjectId()];
    const channel: Document = {
      _id: new Types.ObjectId(),
      type: 'dm',
      organizationId: null,
      members,
    };
    const memberships = members.flatMap(userId =>
      organizations.map(organizationId => ({
        _id: new Types.ObjectId(),
        userId,
        organizationId,
        status: 'active',
        expiresAt: null,
      })),
    );
    const { db } = makeFixture({ channels: [channel], memberships });

    await runChannelOrganizationBackfill(db as any, { apply: true });

    expect(channel.members).toEqual(members);
    expect(channel.organizationScopeQuarantineReason).toBe(
      'ambiguous-shared-org',
    );
  });

  it.each([[1], [3]])(
    'quarantines a DM with %i participant(s) before checking memberships',
    async participantCount => {
      const channel: Document = {
        _id: new Types.ObjectId(),
        type: 'dm',
        organizationId: null,
        members: Array.from(
          { length: participantCount },
          () => new Types.ObjectId(),
        ),
      };
      const originalMembers = [...channel.members];
      const { db } = makeFixture({ channels: [channel] });

      const report = await runChannelOrganizationBackfill(db as any, {
        apply: true,
      });

      expect(channel.members).toEqual(originalMembers);
      expect(channel.organizationScopeQuarantineReason).toBe(
        'invalid-participant-count',
      );
      expect(report.quarantined['invalid-participant-count']).toBe(1);
      expect(db.collection).not.toHaveBeenCalledWith('organizationmemberships');
    },
  );

  it('makes the second apply run a no-op for backfilled and quarantined channels', async () => {
    const workspaceId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const fixture = makeFixture({
      channels: [
        {
          _id: new Types.ObjectId(),
          type: 'custom',
          workspaceId,
          organizationId: null,
        },
        {
          _id: new Types.ObjectId(),
          type: 'dm',
          organizationId: null,
          members: [new Types.ObjectId()],
        },
      ],
      workspaces: [{ _id: workspaceId, organizationId }],
    });

    await runChannelOrganizationBackfill(fixture.db as any, {
      apply: true,
      batchSize: 1,
    });
    fixture.writes.mockClear();
    const secondReport = await runChannelOrganizationBackfill(
      fixture.db as any,
      { apply: true, batchSize: 1 },
    );

    expect(secondReport).toEqual(zeroReport());
    expect(fixture.writes).not.toHaveBeenCalled();
  });

  it('does not rewrite an unchanged quarantine marker during recheck', async () => {
    const firstQuarantinedAt = new Date('2026-07-25T00:00:00.000Z');
    const channel: Document = {
      _id: new Types.ObjectId(),
      type: 'dm',
      organizationId: null,
      members: [new Types.ObjectId()],
      organizationScopeQuarantinedAt: firstQuarantinedAt,
      organizationScopeQuarantineReason: 'invalid-participant-count',
    };
    const fixture = makeFixture({ channels: [channel] });

    const report = await runChannelOrganizationBackfill(fixture.db as any, {
      apply: true,
      recheck: true,
      now: new Date('2026-07-26T00:00:00.000Z'),
    });

    expect(report.writes).toBe(0);
    expect(channel.organizationScopeQuarantinedAt).toEqual(firstQuarantinedAt);
    expect(fixture.writes).not.toHaveBeenCalled();
  });

  it('dry-run reports intended changes without writing documents', async () => {
    const workspaceId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const channel: Document = {
      _id: new Types.ObjectId(),
      type: 'general',
      workspaceId,
      organizationId: null,
    };
    const { db, writes } = makeFixture({
      channels: [channel],
      workspaces: [{ _id: workspaceId, organizationId }],
    });

    const report = await runChannelOrganizationBackfill(db as any);

    expect(report).toEqual({
      ...zeroReport(),
      processed: 1,
      backfilled: 1,
    });
    expect(channel.organizationId).toBeNull();
    expect(writes).not.toHaveBeenCalled();
  });
});
