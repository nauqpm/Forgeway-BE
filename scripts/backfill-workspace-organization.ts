import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { buildWorkspaceOrganizationPreflight } from '../src/modules/workspaces/services/workspace-organization-backfill-preflight';
import { reconcileWorkspaceOrganizationBindings } from '../src/modules/workspaces/services/workspace-organization-reconciliation.service';

type Mode = 'dry-run' | 'apply' | 'verify';
type ConflictCode =
  | 'LEGACY_OWNER_INVALID'
  | 'MISSING_WORKSPACE_OWNER'
  | 'MISSING_USER'
  | 'ORGANIZATION_NOT_FOUND'
  | 'ORGANIZATION_DEACTIVATED'
  | 'WORKSPACE_ALREADY_BOUND_ELSEWHERE'
  | 'TRANSACTION_UNAVAILABLE';

type Report = {
  mode: Mode;
  scannedWorkspaces: number;
  alreadyBoundWorkspaces: number;
  candidateWorkspaces: number;
  updatedWorkspaces: number;
  createdOrganizations: number;
  createdMemberships: number;
  reusedMemberships: number;
  conflicts: { code: ConflictCode; workspaceId?: string; userId?: string }[];
  blocked: boolean;
};

const mode = process.argv[2] as Mode;
const confirm = process.argv.includes('--confirm');
const uri =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  process.env.DB_CONNECTION_STRING;
const slug = process.env.LEGACY_ORGANIZATION_SLUG || 'legacy-organization';
const name = process.env.LEGACY_ORGANIZATION_NAME || 'Legacy Organization';
const ownerId = process.env.LEGACY_ORGANIZATION_OWNER_USER_ID;
const batchSize = Math.min(
  1000,
  Math.max(
    1,
    Number(process.env.WORKSPACE_ORGANIZATION_BACKFILL_BATCH_SIZE || 100),
  ),
);

function conflict(
  report: Report,
  code: ConflictCode,
  value: { workspaceId?: string; userId?: string } = {},
) {
  report.conflicts.push({ code, ...value });
}

async function main() {
  if (!['dry-run', 'apply', 'verify'].includes(mode))
    throw new Error(
      'Usage: backfill-workspace-organization <dry-run|apply|verify> [--confirm]',
    );
  if (mode === 'apply' && !confirm) throw new Error('Apply requires --confirm');
  if (!uri)
    throw new Error(
      'Missing MONGODB_URI, DATABASE_URL, or DB_CONNECTION_STRING',
    );
  if (!ownerId || !Types.ObjectId.isValid(ownerId))
    throw new Error(
      'LEGACY_ORGANIZATION_OWNER_USER_ID must be an active user id',
    );

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const report: Report = {
    mode,
    scannedWorkspaces: 0,
    alreadyBoundWorkspaces: 0,
    candidateWorkspaces: 0,
    updatedWorkspaces: 0,
    createdOrganizations: 0,
    createdMemberships: 0,
    reusedMemberships: 0,
    conflicts: [],
    blocked: false,
  };
  const owner = await db
    .collection('users')
    .findOne({ _id: new Types.ObjectId(ownerId), status: 'active' });
  if (!owner) {
    conflict(report, 'LEGACY_OWNER_INVALID', { userId: ownerId });
    report.blocked = true;
    console.log(JSON.stringify(report));
    return;
  }
  const existingLegacy = await db.collection('organizations').findOne({ slug });
  if (
    existingLegacy &&
    (existingLegacy.status !== 'active' || existingLegacy.deletedAt)
  ) {
    conflict(report, 'ORGANIZATION_DEACTIVATED');
    report.blocked = true;
  }

  const cursor = db
    .collection('workspaces')
    .find(
      {},
      { projection: { _id: 1, organizationId: 1, ownerId: 1, members: 1 } },
    )
    .batchSize(batchSize);
  const candidates: any[] = [];
  for await (const workspace of cursor) {
    report.scannedWorkspaces++;
    if (workspace.organizationId) {
      report.alreadyBoundWorkspaces++;
      const organization = await db
        .collection('organizations')
        .findOne(
          { _id: workspace.organizationId, status: 'active', deletedAt: null },
          { projection: { _id: 1 } },
        );
      if (!organization)
        conflict(report, 'ORGANIZATION_NOT_FOUND', {
          workspaceId: workspace._id.toString(),
        });
      continue;
    }
    if (!workspace.ownerId)
      conflict(report, 'MISSING_WORKSPACE_OWNER', {
        workspaceId: workspace._id.toString(),
      });
    else candidates.push(workspace);
  }
  const userIds = new Set<string>();
  for (const workspace of candidates) {
    if (workspace.ownerId) userIds.add(workspace.ownerId.toString());
    for (const member of workspace.members || [])
      if (member.userId) userIds.add(member.userId.toString());
  }
  const activeUserIds = new Set(
    (
      await db
        .collection('users')
        .find(
          {
            _id: { $in: [...userIds].map(id => new Types.ObjectId(id)) },
            status: 'active',
          },
          { projection: { _id: 1 } },
        )
        .toArray()
    ).map(user => user._id.toString()),
  );
  const preflight = buildWorkspaceOrganizationPreflight({
    configuredOwnerValid: true,
    transactionAvailable: true,
    legacyOrganizationValid:
      !existingLegacy ||
      (existingLegacy.status === 'active' && !existingLegacy.deletedAt),
    workspaces: candidates.map(workspace => ({
      id: workspace._id.toString(),
      ownerId: workspace.ownerId?.toString(),
      memberIds: (workspace.members || [])
        .filter((member: any) => member.userId)
        .map((member: any) => member.userId.toString()),
    })),
    activeUserIds,
  });
  report.conflicts.push(...preflight.conflicts);
  const eligibleIds = new Set(preflight.candidateWorkspaceIds);
  const eligibleCandidates = candidates.filter(workspace =>
    eligibleIds.has(workspace._id.toString()),
  );
  report.candidateWorkspaces = eligibleCandidates.length;
  report.blocked ||= preflight.blocked;
  if (mode === 'verify') {
    const workspaces = await db
      .collection('workspaces')
      .find(
        {},
        { projection: { _id: 1, organizationId: 1, ownerId: 1, members: 1 } },
      )
      .toArray();
    const organizationIds = [
      ...new Set(
        workspaces
          .map(workspace => workspace.organizationId?.toString())
          .filter(Boolean),
      ),
    ];
    const userIdsForVerify = [
      ...new Set(
        workspaces
          .flatMap(workspace => [
            workspace.ownerId,
            ...(workspace.members || []).map((member: any) => member.userId),
          ])
          .filter(Boolean)
          .map(id => id.toString()),
      ),
    ];
    const [organizations, users, memberships] = await Promise.all([
      db
        .collection('organizations')
        .find(
          { _id: { $in: organizationIds.map(id => new Types.ObjectId(id)) } },
          { projection: { _id: 1, status: 1 } },
        )
        .toArray(),
      db
        .collection('users')
        .find(
          { _id: { $in: userIdsForVerify.map(id => new Types.ObjectId(id)) } },
          { projection: { _id: 1, status: 1 } },
        )
        .toArray(),
      db
        .collection('organizationmemberships')
        .find(
          {
            userId: { $in: userIdsForVerify.map(id => new Types.ObjectId(id)) },
          },
          {
            projection: {
              organizationId: 1,
              userId: 1,
              role: 1,
              status: 1,
              expiresAt: 1,
            },
          },
        )
        .toArray(),
    ]);
    const reconciliation = reconcileWorkspaceOrganizationBindings({
      legacyOrganizationId: existingLegacy?._id?.toString(),
      now: new Date(),
      organizations: organizations.map(organization => ({
        id: organization._id.toString(),
        status: organization.status,
      })),
      users: users.map(user => ({
        id: user._id.toString(),
        active: user.status === 'active',
      })),
      memberships: memberships.map(membership => ({
        organizationId: membership.organizationId.toString(),
        userId: membership.userId.toString(),
        role: membership.role,
        status: membership.status,
        expiresAt: membership.expiresAt,
      })),
      workspaces: workspaces.map(workspace => ({
        id: workspace._id.toString(),
        organizationId: workspace.organizationId?.toString(),
        ownerId: workspace.ownerId?.toString(),
        members: (workspace.members || [])
          .filter((member: any) => member.userId)
          .map((member: any) => ({ userId: member.userId.toString() })),
      })),
    });
    report.scannedWorkspaces = reconciliation.scannedWorkspaces;
    report.conflicts.push(...(reconciliation.conflicts as any));
    report.blocked = report.conflicts.length > 0;
    console.log(JSON.stringify(report));
    return;
  }
  if (mode !== 'apply' || report.blocked) {
    console.log(JSON.stringify(report));
    return;
  }

  let organization = existingLegacy;
  const bootstrap = await mongoose.startSession();
  try {
    await bootstrap.withTransaction(async () => {
      if (!organization) {
        const result = await db
          .collection('organizations')
          .insertOne(
            {
              name,
              slug,
              status: 'active',
              createdBy: new Types.ObjectId(ownerId),
              settings: {},
              deletedAt: null,
              deactivatedAt: null,
              lifecycleVersion: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            { session: bootstrap },
          );
        organization = { _id: result.insertedId };
      }
      await db
        .collection('organizationmemberships')
        .updateOne(
          {
            organizationId: organization!._id,
            userId: new Types.ObjectId(ownerId),
          },
          {
            $setOnInsert: {
              organizationId: organization!._id,
              userId: new Types.ObjectId(ownerId),
              role: 'owner',
              membershipType: 'employee',
              status: 'active',
              joinedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { upsert: true, session: bootstrap },
        );
    });
    if (!existingLegacy) report.createdOrganizations++;
  } catch (error) {
    conflict(report, 'TRANSACTION_UNAVAILABLE');
    report.blocked = true;
    throw error;
  } finally {
    await bootstrap.endSession();
  }
  const organizationId = organization!._id as Types.ObjectId;
  for (const workspace of eligibleCandidates) {
    const session = await mongoose.startSession();
    const local = { created: 0, reused: 0, updated: 0 };
    try {
      await session.withTransaction(async () => {
        const users = new Map<
          string,
          { role: 'member' | 'guest'; membershipType: 'employee' | 'guest' }
        >([
          [
            workspace.ownerId.toString(),
            { role: 'member', membershipType: 'employee' },
          ],
        ]);
        for (const member of workspace.members || [])
          if (member.userId)
            users.set(
              member.userId.toString(),
              member.role === 'viewer'
                ? { role: 'guest', membershipType: 'guest' }
                : { role: 'member', membershipType: 'employee' },
            );
        for (const [userId, membership] of users) {
          const result = await db
            .collection('organizationmemberships')
            .updateOne(
              { organizationId, userId: new Types.ObjectId(userId) },
              {
                $setOnInsert: {
                  organizationId,
                  userId: new Types.ObjectId(userId),
                  ...membership,
                  status: 'active',
                  joinedAt: new Date(),
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              },
              { upsert: true, session },
            );
          if (result.upsertedCount) local.created++;
          else local.reused++;
        }
        local.updated = (
          await db
            .collection('workspaces')
            .updateOne(
              { _id: workspace._id, organizationId: null },
              { $set: { organizationId } },
              { session },
            )
        ).modifiedCount;
        if (!local.updated)
          throw new Error('Workspace binding was not updated');
      });
      report.createdMemberships += local.created;
      report.reusedMemberships += local.reused;
      report.updatedWorkspaces += local.updated;
    } catch {
      conflict(report, 'TRANSACTION_UNAVAILABLE', {
        workspaceId: workspace._id.toString(),
      });
      report.blocked = true;
      break;
    } finally {
      await session.endSession();
    }
  }
  console.log(JSON.stringify(report));
}

main().catch(async error => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
