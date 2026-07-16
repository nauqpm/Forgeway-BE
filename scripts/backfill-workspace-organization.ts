import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { buildWorkspaceOrganizationPreflight } from '../src/modules/workspaces/services/workspace-organization-backfill-preflight';

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
  const userIds = new Set<string>();
  for (const workspace of candidates) {
    if (workspace.ownerId) userIds.add(workspace.ownerId.toString());
    for (const member of workspace.members || []) if (member.userId) userIds.add(member.userId.toString());
  }
  const activeUserIds = new Set((await db.collection('users').find({ _id: { $in: [...userIds].map(id => new Types.ObjectId(id)) }, status: 'active' }, { projection: { _id: 1 } }).toArray()).map(user => user._id.toString()));
  const preflight = buildWorkspaceOrganizationPreflight({ configuredOwnerValid: true, transactionAvailable: true, legacyOrganizationValid: !existingLegacy || (existingLegacy.status === 'active' && !existingLegacy.deletedAt), workspaces: candidates.map(workspace => ({ id: workspace._id.toString(), ownerId: workspace.ownerId?.toString(), memberIds: (workspace.members || []).filter((member: any) => member.userId).map((member: any) => member.userId.toString()) })), activeUserIds });
  report.conflicts.push(...preflight.conflicts);
  const eligibleIds = new Set(preflight.candidateWorkspaceIds);
  const eligibleCandidates = candidates.filter(workspace => eligibleIds.has(workspace._id.toString()));
  report.candidateWorkspaces = eligibleCandidates.length;
  report.blocked ||= preflight.blocked;
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
      const users = new Map<string, { role: 'owner' | 'member' | 'guest'; membershipType: 'employee' | 'guest' }>([
        [ownerId, { role: 'owner', membershipType: 'employee' }],
      ]);
      for (const workspace of eligibleCandidates) {
        users.set(workspace.ownerId.toString(), { role: 'member', membershipType: 'employee' });
        for (const member of workspace.members || []) {
          if (!member.userId) continue;
          const userId = member.userId.toString();
          if (!users.has(userId) || member.role !== 'viewer') {
            users.set(userId, member.role === 'viewer' ? { role: 'guest', membershipType: 'guest' } : { role: 'member', membershipType: 'employee' });
          }
        }
      }
      const activeUsers = new Set((await db.collection('users').find({ _id: { $in: [...users.keys()].map(id => new Types.ObjectId(id)) }, status: 'active' }, { session, projection: { _id: 1 } }).toArray()).map(user => user._id.toString()));
      for (const [userId, membership] of users) {
        if (!activeUsers.has(userId)) { conflict(report, 'MISSING_USER', { userId }); throw new Error('Migration blocked by missing user'); }
        const result = await db.collection('organizationmemberships').updateOne(
          { organizationId, userId: new Types.ObjectId(userId) },
          { $setOnInsert: { organizationId, userId: new Types.ObjectId(userId), role: membership.role, membershipType: membership.membershipType, status: 'active', joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date() } },
          { upsert: true, session },
        );
        if (result.upsertedCount) report.createdMemberships++; else report.reusedMemberships++;
      }
      const writes = eligibleCandidates.map(workspace => ({ updateOne: { filter: { _id: workspace._id, organizationId: null }, update: { $set: { organizationId } } } }));
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
