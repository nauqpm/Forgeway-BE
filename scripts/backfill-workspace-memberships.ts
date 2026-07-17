import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const mode = process.argv[2] ?? 'dry-run';
if (!['dry-run', 'apply', 'verify'].includes(mode))
  throw new Error('Use dry-run, apply, or verify');
if (mode === 'apply' && !process.argv.includes('--confirm'))
  throw new Error('Apply requires --confirm');
const uri = process.env.DB_CONNECTION_STRING;
if (!uri) throw new Error('DB_CONNECTION_STRING is required');
const validRoles = new Set(['workspace_admin', 'member', 'viewer']);

async function main(): Promise<void> {
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db();
  const report = {
    scanned: 0,
    missingOrganization: 0,
    created: 0,
    existing: 0,
    conflicts: 0,
    parityConflicts: 0,
  };
  try {
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
          if (
            !existing ||
            existing.organizationId?.toString() !==
              workspace.organizationId.toString() ||
            existing.role !== item.role ||
            existing.status !== 'active' ||
            !org
          )
            report.parityConflicts++;
          continue;
        }
        if (existing) {
          report.existing++;
          continue;
        }
        if (!org) {
          report.conflicts++;
          continue;
        }
        if (mode === 'apply')
          await memberships.updateOne(
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
        report.created++;
      }
    }
  } finally {
    await client.close();
  }
  console.log(JSON.stringify({ mode, ...report }));
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
