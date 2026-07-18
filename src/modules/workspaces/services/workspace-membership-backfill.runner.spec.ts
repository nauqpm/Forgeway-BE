import { ObjectId } from 'mongodb';
import {
  runApply,
  runDryRun,
  runVerify,
} from './workspace-membership-backfill.runner';

type DbFixture = {
  db: any;
  workspaces: any[];
  organizationMemberships: any[];
  memberships: any[];
  writes: {
    updateOne: jest.Mock;
    insertOne: jest.Mock;
    deleteOne: jest.Mock;
  };
};

const cursor = (items: any[]) => ({
  async *[Symbol.asyncIterator]() {
    yield* items;
  },
});

const sameId = (left: any, right: any) => String(left) === String(right);

const makeFixture = (input: Partial<DbFixture> = {}): DbFixture => {
  const workspaces = input.workspaces ?? [];
  const organizationMemberships = input.organizationMemberships ?? [];
  const memberships = input.memberships ?? [];
  const writes = input.writes ?? {
    updateOne: jest.fn(),
    insertOne: jest.fn(),
    deleteOne: jest.fn(),
  };

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'workspaces') {
        return {
          find: jest.fn(() => cursor(workspaces)),
        };
      }
      if (name === 'organizationmemberships') {
        return {
          findOne: jest.fn(
            async (query: any) =>
              organizationMemberships.find(
                membership =>
                  sameId(membership.organizationId, query.organizationId) &&
                  sameId(membership.userId, query.userId) &&
                  membership.status === query.status &&
                  (membership.expiresAt === null ||
                    membership.expiresAt > query.$or[1].expiresAt.$gt),
              ) ?? null,
          ),
        };
      }
      return {
        findOne: jest.fn(
          async (query: any) =>
            memberships.find(
              membership =>
                sameId(membership.workspaceId, query.workspaceId) &&
                sameId(membership.userId, query.userId),
            ) ?? null,
        ),
        find: jest.fn((query: any) =>
          cursor(
            memberships.filter(
              membership =>
                sameId(membership.workspaceId, query.workspaceId) &&
                membership.status === query.status,
            ),
          ),
        ),
        updateOne: jest.fn(async (query: any, update: any) => {
          writes.updateOne(query, update);
          const existing = memberships.find(
            membership =>
              sameId(membership.workspaceId, query.workspaceId) &&
              sameId(membership.userId, query.userId),
          );
          if (!existing && update.$setOnInsert) {
            memberships.push({ _id: new ObjectId(), ...update.$setOnInsert });
          }
          return { acknowledged: true, upsertedCount: existing ? 0 : 1 };
        }),
        insertOne: writes.insertOne,
        deleteOne: writes.deleteOne,
      };
    }),
  };

  return { db, workspaces, organizationMemberships, memberships, writes };
};

const ids = () => ({
  workspaceId: new ObjectId(),
  organizationId: new ObjectId(),
  ownerId: new ObjectId(),
  memberId: new ObjectId(),
});

describe('workspace membership backfill runner direct tests', () => {
  it('dry-run is read-only and reports a workspace missing organizationId', async () => {
    const { db, writes } = makeFixture({
      workspaces: [{ _id: new ObjectId(), ownerId: new ObjectId() }],
    });

    const report = await runDryRun(db);

    expect(report).toMatchObject({ scanned: 1, missingOrganization: 1 });
    expect(writes.updateOne).not.toHaveBeenCalled();
    expect(writes.insertOne).not.toHaveBeenCalled();
    expect(writes.deleteOne).not.toHaveBeenCalled();
  });

  it('dry-run detects missing owner and member memberships', async () => {
    const { workspaceId, organizationId, ownerId, memberId } = ids();
    const { db } = makeFixture({
      workspaces: [
        {
          _id: workspaceId,
          organizationId,
          ownerId,
          members: [{ userId: memberId, role: 'member' }],
        },
      ],
      organizationMemberships: [
        { organizationId, userId: ownerId, status: 'active', expiresAt: null },
        { organizationId, userId: memberId, status: 'active', expiresAt: null },
      ],
    });

    const report = await runDryRun(db);

    expect(report).toMatchObject({ missingMemberships: 2 });
  });

  it('dry-run detects unknown legacy roles without aborting the scan', async () => {
    const { workspaceId, organizationId, ownerId, memberId } = ids();
    const { db } = makeFixture({
      workspaces: [
        {
          _id: workspaceId,
          organizationId,
          ownerId,
          members: [{ userId: memberId, role: 'unknown-role' }],
        },
      ],
      organizationMemberships: [
        { organizationId, userId: ownerId, status: 'active', expiresAt: null },
      ],
    });

    const report = await runDryRun(db);

    expect(report).toMatchObject({ scanned: 1, conflicts: 1 });
  });

  it.each([
    ['missing', undefined],
    ['inactive', { status: 'inactive', expiresAt: null }],
    ['expired', { status: 'active', expiresAt: new Date(Date.now() - 1000) }],
  ])(
    'dry-run detects OrganizationMembership %s',
    async (_label, organizationMembership) => {
      const { workspaceId, organizationId, ownerId } = ids();
      const { db } = makeFixture({
        workspaces: [{ _id: workspaceId, organizationId, ownerId }],
        organizationMemberships: organizationMembership
          ? [{ organizationId, userId: ownerId, ...organizationMembership }]
          : [],
      });

      const report = await runDryRun(db);

      expect(report).toMatchObject({ conflicts: 1 });
    },
  );

  it('dry-run reports exact scan and conflict counts', async () => {
    const first = ids();
    const second = ids();
    const { db } = makeFixture({
      workspaces: [
        { _id: first.workspaceId },
        { _id: second.workspaceId, organizationId: second.organizationId },
      ],
    });

    await expect(runDryRun(db)).resolves.toMatchObject({
      scanned: 2,
      missingOrganization: 2,
      conflicts: 0,
      created: 0,
    });
  });

  it('apply maps owner, member, and viewer roles to inserted memberships', async () => {
    const { workspaceId, organizationId, ownerId, memberId } = ids();
    const viewerId = new ObjectId();
    const fixture = makeFixture({
      workspaces: [
        {
          _id: workspaceId,
          organizationId,
          ownerId,
          members: [
            { userId: memberId, role: 'member' },
            { userId: viewerId, role: 'viewer' },
          ],
        },
      ],
      organizationMemberships: [ownerId, memberId, viewerId].map(userId => ({
        organizationId,
        userId,
        status: 'active',
        expiresAt: null,
      })),
    });

    await runApply(fixture.db);

    expect(fixture.writes.updateOne).toHaveBeenCalledTimes(3);
    expect(fixture.memberships.map(membership => membership.role)).toEqual([
      'workspace_admin',
      'member',
      'viewer',
    ]);
  });

  it('apply fails closed for unknown roles without creating invalid membership', async () => {
    const { workspaceId, organizationId, ownerId, memberId } = ids();
    const fixture = makeFixture({
      workspaces: [
        {
          _id: workspaceId,
          organizationId,
          ownerId,
          members: [{ userId: memberId, role: 'invalid' }],
        },
      ],
      organizationMemberships: [
        { organizationId, userId: ownerId, status: 'active', expiresAt: null },
      ],
    });

    const report = await runApply(fixture.db);

    expect(report.conflicts).toBe(1);
    expect(fixture.writes.updateOne).toHaveBeenCalledTimes(1);
    expect(fixture.memberships[0].role).toBe('workspace_admin');
  });

  it('apply reuses an existing compatible membership without overwriting it', async () => {
    const { workspaceId, organizationId, ownerId } = ids();
    const existing = {
      _id: new ObjectId(),
      workspaceId,
      organizationId,
      userId: ownerId,
      role: 'workspace_admin',
      status: 'active',
      source: 'owner',
    };
    const fixture = makeFixture({
      workspaces: [{ _id: workspaceId, organizationId, ownerId }],
      organizationMemberships: [
        { organizationId, userId: ownerId, status: 'active', expiresAt: null },
      ],
      memberships: [existing],
    });

    await runApply(fixture.db);

    expect(fixture.memberships).toEqual([existing]);
    expect(fixture.writes.updateOne).not.toHaveBeenCalled();
  });

  it('apply does not overwrite an existing conflicting membership', async () => {
    const { workspaceId, organizationId, ownerId } = ids();
    const existing = {
      _id: new ObjectId(),
      workspaceId,
      organizationId,
      userId: ownerId,
      role: 'member',
      status: 'suspended',
      source: 'manual',
    };
    const fixture = makeFixture({
      workspaces: [{ _id: workspaceId, organizationId, ownerId }],
      organizationMemberships: [
        { organizationId, userId: ownerId, status: 'active', expiresAt: null },
      ],
      memberships: [existing],
    });

    const report = await runApply(fixture.db);

    expect(report.conflicts).toBe(1);
    expect(fixture.memberships).toEqual([existing]);
    expect(fixture.writes.updateOne).not.toHaveBeenCalled();
  });

  it('apply is resume-safe when part of the dataset was already processed', async () => {
    const { workspaceId, organizationId, ownerId, memberId } = ids();
    const fixture = makeFixture({
      workspaces: [
        {
          _id: workspaceId,
          organizationId,
          ownerId,
          members: [{ userId: memberId, role: 'member' }],
        },
      ],
      organizationMemberships: [
        { organizationId, userId: ownerId, status: 'active', expiresAt: null },
        { organizationId, userId: memberId, status: 'active', expiresAt: null },
      ],
    });

    await runApply(fixture.db);
    const callsAfterFirstRun = fixture.writes.updateOne.mock.calls.length;
    await runApply(fixture.db);

    expect(fixture.writes.updateOne).toHaveBeenCalledTimes(callsAfterFirstRun);
    expect(fixture.memberships).toHaveLength(2);
  });

  it('apply is idempotent on the second run without rewriting valid data', async () => {
    const { workspaceId, organizationId, ownerId } = ids();
    const fixture = makeFixture({
      workspaces: [{ _id: workspaceId, organizationId, ownerId }],
      organizationMemberships: [
        { organizationId, userId: ownerId, status: 'active', expiresAt: null },
      ],
    });

    const first = await runApply(fixture.db);
    const original = { ...fixture.memberships[0] };
    const second = await runApply(fixture.db);

    expect(first).toMatchObject({
      createdMemberships: 1,
      updatedMemberships: 0,
    });
    expect(second).toMatchObject({
      createdMemberships: 0,
      updatedMemberships: 0,
    });
    expect(fixture.memberships).toEqual([original]);
    expect(fixture.writes.updateOne).toHaveBeenCalledTimes(1);
  });

  it('verify is read-only and reports a missing owner membership', async () => {
    const { workspaceId, organizationId, ownerId } = ids();
    const { db, writes } = makeFixture({
      workspaces: [{ _id: workspaceId, organizationId, ownerId }],
      organizationMemberships: [
        { organizationId, userId: ownerId, status: 'active', expiresAt: null },
      ],
    });

    const report = await runVerify(db);

    expect(report).toMatchObject({ parityConflicts: 1 });
    expect(writes.updateOne).not.toHaveBeenCalled();
    expect(writes.insertOne).not.toHaveBeenCalled();
    expect(writes.deleteOne).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong role', { role: 'member', status: 'active', source: 'owner' }],
    [
      'wrong status',
      { role: 'workspace_admin', status: 'suspended', source: 'owner' },
    ],
    [
      'wrong organization',
      { role: 'workspace_admin', status: 'active', source: 'owner' },
    ],
  ])('verify reports owner membership with %s', async (_label, stored) => {
    const { workspaceId, organizationId, ownerId } = ids();
    const fixture = makeFixture({
      workspaces: [{ _id: workspaceId, organizationId, ownerId }],
      organizationMemberships: [
        { organizationId, userId: ownerId, status: 'active', expiresAt: null },
      ],
      memberships: [
        {
          workspaceId,
          organizationId:
            _label === 'wrong organization' ? new ObjectId() : organizationId,
          userId: ownerId,
          ...stored,
        },
      ],
    });

    const report = await runVerify(fixture.db);

    expect(report.parityConflicts).toBe(1);
  });

  it('verify reports a missing member membership and organization membership conflict', async () => {
    const { workspaceId, organizationId, ownerId, memberId } = ids();
    const { db } = makeFixture({
      workspaces: [
        {
          _id: workspaceId,
          organizationId,
          ownerId,
          members: [{ userId: memberId, role: 'member' }],
        },
      ],
      organizationMemberships: [
        {
          organizationId,
          userId: memberId,
          status: 'inactive',
          expiresAt: null,
        },
      ],
    });

    const report = await runVerify(db);

    expect(report.parityConflicts).toBe(2);
  });

  it('verify reports active new-only memberships without embedded access', async () => {
    const { workspaceId, organizationId, ownerId } = ids();
    const fixture = makeFixture({
      workspaces: [{ _id: workspaceId, organizationId, ownerId }],
      memberships: [
        {
          _id: new ObjectId(),
          workspaceId,
          organizationId,
          userId: new ObjectId(),
          role: 'member',
          status: 'active',
        },
      ],
    });

    const report = await runVerify(fixture.db);

    expect(report).toMatchObject({ newOnlyMemberships: 1 });
  });

  it('verify passes cleanly for a valid dataset', async () => {
    const { workspaceId, organizationId, ownerId } = ids();
    const fixture = makeFixture({
      workspaces: [{ _id: workspaceId, organizationId, ownerId }],
      organizationMemberships: [
        { organizationId, userId: ownerId, status: 'active', expiresAt: null },
      ],
      memberships: [
        {
          _id: new ObjectId(),
          workspaceId,
          organizationId,
          userId: ownerId,
          role: 'workspace_admin',
          status: 'active',
          source: 'owner',
        },
      ],
    });

    await expect(runVerify(fixture.db)).resolves.toMatchObject({
      parityConflicts: 0,
    });
  });
});
