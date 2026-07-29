import 'dotenv/config';
import { Db, MongoClient } from 'mongodb';
import { Types } from 'mongoose';
import { computeDmParticipantKey } from '../src/modules/chat/utils/dm-participant-key.util';

type QuarantineReason =
  | 'no-shared-org'
  | 'ambiguous-shared-org'
  | 'invalid-participant-count';

type ChannelRecord = {
  _id: Types.ObjectId;
  type: string;
  workspaceId?: Types.ObjectId | null;
  organizationId?: Types.ObjectId | null;
  dmParticipantKey?: string | null;
  members?: Types.ObjectId[];
  organizationScopeQuarantinedAt?: Date | null;
  organizationScopeQuarantineReason?: QuarantineReason | null;
};

export type ChannelOrganizationBackfillReport = {
  processed: number;
  backfilled: number;
  quarantined: {
    total: number;
    'no-shared-org': number;
    'ambiguous-shared-org': number;
    'invalid-participant-count': number;
  };
  skipped: { workspaceNotBackfilled: number };
  writes: number;
};

type BackfillOptions = {
  apply?: boolean;
  recheck?: boolean;
  batchSize?: number;
  now?: Date;
};

const workspaceChannelTypes = new Set([
  'general',
  'workspace',
  'announcement',
  'custom',
]);

const emptyReport = (): ChannelOrganizationBackfillReport => ({
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

async function findSharedActiveOrganization(
  db: Db,
  firstUserId: Types.ObjectId,
  secondUserId: Types.ObjectId,
  now: Date,
): Promise<
  | { organizationId: Types.ObjectId }
  | { reason: 'no-shared-org' | 'ambiguous-shared-org' }
> {
  const memberships = db.collection('organizationmemberships');
  const activeMembership = {
    status: 'active',
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  };
  const firstMemberships = await memberships
    .find(
      { ...activeMembership, userId: firstUserId },
      { projection: { organizationId: 1 } },
    )
    .toArray();
  const organizationIds = firstMemberships
    .map(membership => membership.organizationId as Types.ObjectId)
    .filter(Boolean);
  if (organizationIds.length === 0) return { reason: 'no-shared-org' };

  const sharedMemberships = await memberships
    .find(
      {
        ...activeMembership,
        userId: secondUserId,
        organizationId: { $in: organizationIds },
      },
      { projection: { organizationId: 1 } },
    )
    .toArray();
  const sharedOrganizationIds = [
    ...new Set(
      sharedMemberships
        .map(membership => membership.organizationId?.toString())
        .filter(Boolean),
    ),
  ];
  if (sharedOrganizationIds.length === 0) return { reason: 'no-shared-org' };
  if (sharedOrganizationIds.length > 1) {
    return { reason: 'ambiguous-shared-org' };
  }
  return {
    organizationId: new Types.ObjectId(sharedOrganizationIds[0]),
  };
}

export async function runChannelOrganizationBackfill(
  db: Db,
  options: BackfillOptions = {},
): Promise<ChannelOrganizationBackfillReport> {
  const apply = options.apply ?? false;
  const recheck = options.recheck ?? false;
  const batchSize = Math.max(1, options.batchSize ?? 100);
  const now = options.now ?? new Date();
  const report = emptyReport();
  const channels = db.collection<ChannelRecord>('channels');
  const workspaces = db.collection('workspaces');
  let lastId: Types.ObjectId | undefined;

  while (true) {
    const query = {
      organizationId: null,
      ...(lastId ? { _id: { $gt: lastId } } : {}),
      ...(recheck
        ? {}
        : { organizationScopeQuarantinedAt: { $exists: false } }),
    };
    const batch = await channels
      .find(query)
      .sort({ _id: 1 })
      .limit(batchSize)
      .toArray();
    if (batch.length === 0) break;

    for (const channel of batch) {
      report.processed++;
      let organizationId: Types.ObjectId | undefined;
      let dmParticipantKey: string | undefined;
      let quarantineReason: QuarantineReason | undefined;

      if (workspaceChannelTypes.has(channel.type)) {
        const workspace = channel.workspaceId
          ? await workspaces.findOne(
              { _id: channel.workspaceId },
              { projection: { organizationId: 1 } },
            )
          : null;
        if (!workspace?.organizationId) {
          report.skipped.workspaceNotBackfilled++;
          continue;
        }
        organizationId = workspace.organizationId as Types.ObjectId;
      } else if (channel.type === 'dm') {
        const members = channel.members ?? [];
        if (
          members.length !== 2 ||
          members[0].toString() === members[1].toString()
        ) {
          quarantineReason = 'invalid-participant-count';
        } else {
          dmParticipantKey = computeDmParticipantKey(members[0], members[1]);
          const organization = await findSharedActiveOrganization(
            db,
            members[0],
            members[1],
            now,
          );
          if ('reason' in organization) {
            quarantineReason = organization.reason;
          } else {
            organizationId = organization.organizationId;
          }
        }
      } else {
        report.skipped.workspaceNotBackfilled++;
        continue;
      }

      if (quarantineReason) {
        report.quarantined.total++;
        report.quarantined[quarantineReason]++;
        const quarantineChanged =
          !channel.organizationScopeQuarantinedAt ||
          channel.organizationScopeQuarantineReason !== quarantineReason;
        if (apply && quarantineChanged) {
          const result = await channels.updateOne(
            {
              _id: channel._id,
              organizationId: null,
              ...(recheck
                ? {}
                : { organizationScopeQuarantinedAt: { $exists: false } }),
            },
            {
              $set: {
                ...(!channel.organizationScopeQuarantinedAt
                  ? { organizationScopeQuarantinedAt: now }
                  : {}),
                organizationScopeQuarantineReason: quarantineReason,
              },
            },
          );
          report.writes += result.modifiedCount;
        }
        continue;
      }

      report.backfilled++;
      if (apply) {
        const result = await channels.updateOne(
          { _id: channel._id, organizationId: null },
          {
            $set: {
              organizationId,
              ...(dmParticipantKey ? { dmParticipantKey } : {}),
              ...(recheck
                ? {
                    organizationScopeQuarantinedAt: null,
                    organizationScopeQuarantineReason: null,
                  }
                : {}),
            },
          },
        );
        report.writes += result.modifiedCount;
      }
    }

    lastId = batch[batch.length - 1]._id;
  }

  return report;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const recheck = process.argv.includes('--recheck');
  const uri =
    process.env.MONGODB_URI ??
    process.env.DATABASE_URL ??
    process.env.DB_CONNECTION_STRING;
  if (!uri) {
    throw new Error(
      'Missing MONGODB_URI, DATABASE_URL, or DB_CONNECTION_STRING',
    );
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const report = await runChannelOrganizationBackfill(client.db(), {
      apply,
      recheck,
    });
    console.log(
      JSON.stringify({ mode: apply ? 'apply' : 'dry-run', recheck, ...report }),
    );
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
