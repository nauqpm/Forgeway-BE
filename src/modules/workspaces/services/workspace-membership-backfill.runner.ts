import { Db, ObjectId } from 'mongodb';

export type WorkspaceMembershipBackfillMode = 'dry-run' | 'apply' | 'verify';

export type WorkspaceMembershipBackfillReport = {
  scanned: number;
  missingOrganization: number;
  missingMemberships: number;
  created: number;
  createdMemberships: number;
  updatedMemberships: number;
  existing: number;
  conflicts: number;
  parityConflicts: number;
  newOnlyMemberships: number;
};

const validRoles = new Set(['workspace_admin', 'member', 'viewer']);

export async function runWorkspaceMembershipBackfill(
  db: Db,
  mode: WorkspaceMembershipBackfillMode,
): Promise<WorkspaceMembershipBackfillReport> {
  const report: WorkspaceMembershipBackfillReport = {
    scanned: 0,
    missingOrganization: 0,
    missingMemberships: 0,
    created: 0,
    createdMemberships: 0,
    updatedMemberships: 0,
    existing: 0,
    conflicts: 0,
    parityConflicts: 0,
    newOnlyMemberships: 0,
  };
  const workspaces = db.collection('workspaces');
  const memberships = db.collection('workspacememberships');
  const organizations = db.collection('organizationmemberships');

  for await (const workspace of workspaces.find(
    {},
    { projection: { _id: 1, organizationId: 1, ownerId: 1, members: 1 } },
  )) {
    report.scanned++;
    if (!workspace.organizationId || !workspace.ownerId) {
      report.missingOrganization++;
      continue;
    }
    const expected = [
      {
        userId: workspace.ownerId as ObjectId,
        role: 'workspace_admin',
        source: 'owner',
      },
      ...((workspace.members ?? []) as { userId: ObjectId; role: string }[])
        .filter(member => !member.userId.equals(workspace.ownerId))
        .map(member => ({
          userId: member.userId,
          role: member.role,
          source: 'legacy_embedded',
        })),
    ];
    for (const item of expected) {
      if (!validRoles.has(item.role)) {
        report.conflicts++;
        continue;
      }
      const org = await organizations.findOne({
        organizationId: workspace.organizationId,
        userId: item.userId,
        status: 'active',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      });
      const existing = await memberships.findOne({
        workspaceId: workspace._id,
        userId: item.userId,
      });
      if (mode === 'verify') {
        if (!existing) report.missingMemberships++;
        if (
          !existing ||
          existing.organizationId?.toString() !==
            workspace.organizationId.toString() ||
          existing.role !== item.role ||
          existing.status !== 'active' ||
          existing.source !== item.source ||
          !org
        ) {
          report.parityConflicts++;
          if (existing) report.conflicts++;
        }
        continue;
      }
      if (existing) {
        const compatible =
          existing.organizationId?.toString() ===
            workspace.organizationId.toString() &&
          existing.role === item.role &&
          existing.status === 'active' &&
          existing.source === item.source;
        if (compatible) report.existing++;
        else report.conflicts++;
        continue;
      }
      report.missingMemberships++;
      if (!org) {
        report.conflicts++;
        continue;
      }
      if (mode === 'apply') {
        const result = await memberships.updateOne(
          { workspaceId: workspace._id, userId: item.userId },
          {
            $setOnInsert: {
              workspaceId: workspace._id,
              organizationId: workspace.organizationId,
              userId: item.userId,
              role: item.role,
              status: 'active',
              source: item.source,
              joinedAt: new Date(),
              lastSyncedFromLegacyAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        );
        if (result.upsertedCount === 1) report.createdMemberships++;
      }
      report.created++;
    }

    if (mode === 'verify' && memberships.find) {
      const expectedUserIds = new Set(
        expected.map(item => item.userId.toString()),
      );
      for await (const membership of memberships.find({
        workspaceId: workspace._id,
        status: 'active',
      })) {
        if (!expectedUserIds.has(membership.userId.toString()))
          report.newOnlyMemberships++;
      }
    }
  }

  return report;
}

export const runDryRun = (db: Db) =>
  runWorkspaceMembershipBackfill(db, 'dry-run');

export const runApply = (db: Db) => runWorkspaceMembershipBackfill(db, 'apply');

export const runVerify = (db: Db) =>
  runWorkspaceMembershipBackfill(db, 'verify');
