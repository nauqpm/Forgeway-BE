import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

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
const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.DB_CONNECTION_STRING;
const slug = process.env.LEGACY_ORGANIZATION_SLUG || 'legacy-organization';
const name = process.env.LEGACY_ORGANIZATION_NAME || 'Legacy Organization';
const ownerId = process.env.LEGACY_ORGANIZATION_OWNER_USER_ID;
const batchSize = Math.min(1000, Math.max(1, Number(process.env.WORKSPACE_ORGANIZATION_BACKFILL_BATCH_SIZE || 100)));

function conflict(report: Report, code: ConflictCode, value: { workspaceId?: string; userId?: string } = {}) {
  report.conflicts.push({ code, ...value });
}

async function main() {
  if (!['dry-run', 'apply', 'verify'].includes(mode)) throw new Error('Usage: backfill-workspace-organization <dry-run|apply|verify> [--confirm]');
  if (mode === 'apply' && !confirm) throw new Error('Apply requires --confirm');
  if (!uri) throw new Error('Missing MONGODB_URI, DATABASE_URL, or DB_CONNECTION_STRING');
  if (!ownerId || !Types.ObjectId.isValid(ownerId)) throw new Error('LEGACY_ORGANIZATION_OWNER_USER_ID must be an active user id');

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const report: Report = { mode, scannedWorkspaces: 0, alreadyBoundWorkspaces: 0, candidateWorkspaces: 0, updatedWorkspaces: 0, createdOrganizations: 0, createdMemberships: 0, reusedMemberships: 0, conflicts: [], blocked: false };
  const owner = await db.collection('users').findOne({ _id: new Types.ObjectId(ownerId), status: 'active' });
  if (!owner) {
    conflict(report, 'LEGACY_OWNER_INVALID', { userId: ownerId });
    report.blocked = true;
    console.log(JSON.stringify(report));
    return;
  }
  const existingLegacy = await db.collection('organizations').findOne({ slug });
  if (existingLegacy && (existingLegacy.status !== 'active' || existingLegacy.deletedAt)) {
    conflict(report, 'ORGANIZATION_DEACTIVATED');
    report.blocked = true;
  }

  const cursor = db.collection('workspaces').find({}, { projection: { _id: 1, organizationId: 1, ownerId: 1, members: 1 } }).batchSize(batchSize);
  const candidates: any[] = [];
  for await (const workspace of cursor) {
    report.scannedWorkspaces++;
    if (workspace.organizationId) {
      report.alreadyBoundWorkspaces++;
      const organization = await db.collection('organizations').findOne({ _id: workspace.organizationId, status: 'active', deletedAt: null }, { projection: { _id: 1 } });
      if (!organization) conflict(report, 'ORGANIZATION_NOT_FOUND', { workspaceId: workspace._id.toString() });
      continue;
    }
    if (!workspace.ownerId) conflict(report, 'MISSING_WORKSPACE_OWNER', { workspaceId: workspace._id.toString() });
    else candidates.push(workspace);
  }
  report.candidateWorkspaces = candidates.length;
  if (report.conflicts.length) report.blocked = true;
  if (mode !== 'apply' || report.blocked) {
    console.log(JSON.stringify(report));
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      let organization = existingLegacy;
      if (!organization) {
        const result = await db.collection('organizations').insertOne({ name, slug, status: 'active', createdBy: new Types.ObjectId(ownerId), settings: {}, deletedAt: null, deactivatedAt: null, lifecycleVersion: 0, createdAt: new Date(), updatedAt: new Date() }, { session });
        organization = { _id: result.insertedId };
        report.createdOrganizations++;
      }
      const organizationId = organization._id as Types.ObjectId;
      const users = new Set<string>([ownerId]);
      for (const workspace of candidates) {
        users.add(workspace.ownerId.toString());
        for (const member of workspace.members || []) if (member.userId) users.add(member.userId.toString());
      }
      const activeUsers = new Set((await db.collection('users').find({ _id: { $in: [...users].map(id => new Types.ObjectId(id)) }, status: 'active' }, { session, projection: { _id: 1 } }).toArray()).map(user => user._id.toString()));
      for (const userId of users) {
        if (!activeUsers.has(userId)) { conflict(report, 'MISSING_USER', { userId }); throw new Error('Migration blocked by missing user'); }
        const role = userId === ownerId ? 'owner' : 'member';
        const membershipType = 'employee';
        const result = await db.collection('organizationmemberships').updateOne(
          { organizationId, userId: new Types.ObjectId(userId) },
          { $setOnInsert: { organizationId, userId: new Types.ObjectId(userId), role, membershipType, status: 'active', joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date() } },
          { upsert: true, session },
        );
        if (result.upsertedCount) report.createdMemberships++; else report.reusedMemberships++;
      }
      const writes = candidates.map(workspace => ({ updateOne: { filter: { _id: workspace._id, organizationId: null }, update: { $set: { organizationId } } } }));
      if (writes.length) report.updatedWorkspaces = (await db.collection('workspaces').bulkWrite(writes, { ordered: true, session })).modifiedCount;
    });
  } catch (error) {
    if (!report.conflicts.length) conflict(report, 'TRANSACTION_UNAVAILABLE');
    report.blocked = true;
    throw error;
  } finally { await session.endSession(); }
  console.log(JSON.stringify(report));
}

main().catch(async error => { console.error(error); await mongoose.disconnect(); process.exitCode = 1; });
