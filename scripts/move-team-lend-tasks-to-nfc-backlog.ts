import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

export const SOURCE_WORKSPACE_ID = '6a6abd913e87525f151bd340';
export const TARGET_WORKSPACE_ID = '6a76af6c8fe199366f1b89ca';
export const APPLY_CONFIRMATION = 'MOVE-TEAM-LEND-TRUST-TO-NFC-BACKLOG';

type ScriptOptions = { apply: boolean };

type TaskRecord = {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  key: string;
  isDeleted?: boolean;
  assigneeId?: Types.ObjectId;
  reporterId?: Types.ObjectId;
  labelIds?: Types.ObjectId[];
  epicId?: Types.ObjectId;
  parentId?: Types.ObjectId;
  updatedAt?: Date;
};

type WorkspaceRecord = {
  _id: Types.ObjectId;
  name?: string;
  type?: string;
  ownerId?: Types.ObjectId;
  members?: Array<{ userId?: Types.ObjectId }>;
  deletedAt?: Date | null;
};

type Preflight = {
  tasks: TaskRecord[];
  taskIds: Types.ObjectId[];
  taskIdStrings: string[];
  relatedCounts: Record<string, number>;
  blockers: string[];
};

export function parseOptions(argv: string[]): ScriptOptions {
  let apply = false;
  let confirmation: string | undefined;

  for (const arg of argv) {
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg.startsWith('--confirm=')) {
      confirmation = arg.slice('--confirm='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (apply && confirmation !== APPLY_CONFIRMATION) {
    throw new Error(
      `Use --apply --confirm=${APPLY_CONFIRMATION} to write changes`,
    );
  }
  if (!apply && confirmation) {
    throw new Error('Use --confirm only together with --apply');
  }

  return { apply };
}

export function buildTaskUpdate(targetWorkspaceId: Types.ObjectId) {
  return {
    $set: {
      workspaceId: targetWorkspaceId,
      sprintId: null,
      columnId: 'todo',
      status: 'todo',
    },
    $unset: { boardId: '', rank: '' },
  };
}

function uniqueIds(
  values: Array<Types.ObjectId | undefined>,
): Types.ObjectId[] {
  const seen = new Map<string, Types.ObjectId>();
  for (const value of values) {
    if (value) seen.set(value.toString(), value);
  }
  return [...seen.values()];
}

function taskReferenceBlockers(tasks: TaskRecord[], taskIds: Types.ObjectId[]) {
  const taskIdSet = new Set(taskIds.map(taskId => taskId.toString()));
  const references = tasks.flatMap(task => [
    { relation: 'parentId', value: task.parentId },
    { relation: 'epicId', value: task.epicId },
  ]);

  return references
    .filter(
      reference =>
        reference.value && !taskIdSet.has(reference.value.toString()),
    )
    .map(
      reference =>
        `Task ${reference.relation} ${reference.value?.toString()} is outside the move set`,
    );
}

export async function preflight(db: mongoose.mongo.Db): Promise<Preflight> {
  const sourceWorkspaceId = new Types.ObjectId(SOURCE_WORKSPACE_ID);
  const targetWorkspaceId = new Types.ObjectId(TARGET_WORKSPACE_ID);
  const workspaces = db.collection<WorkspaceRecord>('workspaces');
  const tasksCollection = db.collection<TaskRecord>('tasks');

  const [source, target, tasks] = await Promise.all([
    workspaces.findOne({ _id: sourceWorkspaceId, deletedAt: null }),
    workspaces.findOne({ _id: targetWorkspaceId, deletedAt: null }),
    tasksCollection
      .find({ workspaceId: sourceWorkspaceId, isDeleted: { $ne: true } })
      .project<TaskRecord>({
        _id: 1,
        key: 1,
        assigneeId: 1,
        reporterId: 1,
        labelIds: 1,
        epicId: 1,
        parentId: 1,
        updatedAt: 1,
      })
      .toArray(),
  ]);

  const blockers: string[] = [];
  if (
    !source ||
    source.name?.trim() !== 'Team Lend Trust' ||
    source.type !== 'kanban'
  ) {
    blockers.push(
      'Source workspace is not the expected active Team Lend Trust Kanban workspace',
    );
  }
  if (!target || target.name !== 'NFC Platform' || target.type !== 'scrum') {
    blockers.push(
      'Target workspace is not the expected active NFC Platform Scrum workspace',
    );
  }

  const taskIds = tasks.map(task => task._id);
  const taskIdStrings = taskIds.map(taskId => taskId.toString());
  if (!tasks.length)
    blockers.push('No non-deleted Team Lend Trust tasks were found');

  const [keyCollisions, dependencies, relatedCounts] = await Promise.all([
    tasks.length
      ? tasksCollection
          .find({
            workspaceId: targetWorkspaceId,
            key: { $in: tasks.map(task => task.key) },
          })
          .project<{ key: string }>({ key: 1 })
          .toArray()
      : [],
    taskIds.length
      ? db
          .collection<{
            workspaceId: Types.ObjectId;
            fromTaskId: Types.ObjectId;
            toTaskId: Types.ObjectId;
          }>('taskdependencies')
          .find({
            workspaceId: sourceWorkspaceId,
            $or: [
              { fromTaskId: { $in: taskIds } },
              { toTaskId: { $in: taskIds } },
            ],
          })
          .toArray()
      : [],
    countRelatedRecords(db, sourceWorkspaceId, taskIds, taskIdStrings),
  ]);

  if (keyCollisions.length) {
    blockers.push(
      `Destination already contains task key(s): ${keyCollisions.map(task => task.key).join(', ')}`,
    );
  }

  blockers.push(...taskReferenceBlockers(tasks, taskIds));

  const outsideReferences = taskIds.length
    ? await tasksCollection
        .find({
          _id: { $nin: taskIds },
          $or: [{ parentId: { $in: taskIds } }, { epicId: { $in: taskIds } }],
        })
        .project({ _id: 1 })
        .toArray()
    : [];
  if (outsideReferences.length) {
    blockers.push(
      'One or more tasks outside the move set reference a moved parent or epic',
    );
  }

  const taskIdSet = new Set(taskIdStrings);
  for (const dependency of dependencies) {
    if (
      !taskIdSet.has(dependency.fromTaskId.toString()) ||
      !taskIdSet.has(dependency.toTaskId.toString())
    ) {
      blockers.push(
        `Dependency ${dependency.fromTaskId.toString()} -> ${dependency.toTaskId.toString()} crosses the move boundary`,
      );
    }
  }

  if (target) {
    const targetMemberIds = new Set(
      uniqueIds([
        target.ownerId,
        ...(target.members ?? []).map(member => member.userId),
      ]).map(memberId => memberId.toString()),
    );
    const referencedUsers = uniqueIds(
      tasks.flatMap(task => [task.assigneeId, task.reporterId]),
    );
    const nonMembers = referencedUsers.filter(
      userId => !targetMemberIds.has(userId.toString()),
    );
    if (nonMembers.length) {
      blockers.push(
        `Assignee/reporter is not a member of NFC Platform: ${nonMembers.map(userId => userId.toString()).join(', ')}`,
      );
    }
  }

  const labelIds = uniqueIds(tasks.flatMap(task => task.labelIds ?? []));
  if (labelIds.length) {
    const labelsInTarget = await db
      .collection<{
        _id: Types.ObjectId;
        workspaceId: Types.ObjectId;
        isDeleted?: boolean;
      }>('labels')
      .find({
        _id: { $in: labelIds },
        workspaceId: targetWorkspaceId,
        isDeleted: { $ne: true },
      })
      .toArray();
    if (labelsInTarget.length !== labelIds.length) {
      blockers.push(
        'One or more task labels belong to Team Lend Trust and need an explicit mapping before moving tasks',
      );
    }
  }

  return { tasks, taskIds, taskIdStrings, relatedCounts, blockers };
}

async function countRelatedRecords(
  db: mongoose.mongo.Db,
  sourceWorkspaceId: Types.ObjectId,
  taskIds: Types.ObjectId[],
  taskIdStrings: string[],
): Promise<Record<string, number>> {
  if (!taskIds.length) {
    return {
      taskActivities: 0,
      workLogs: 0,
      comments: 0,
      attachments: 0,
      dependencies: 0,
    };
  }

  const taskFilter = {
    workspaceId: sourceWorkspaceId,
    taskId: { $in: taskIds },
  };
  const targetFilter = {
    workspaceId: sourceWorkspaceId,
    targetType: 'task',
    targetId: { $in: taskIdStrings },
  };
  const dependencyFilter = {
    workspaceId: sourceWorkspaceId,
    fromTaskId: { $in: taskIds },
    toTaskId: { $in: taskIds },
  };

  const [taskActivities, workLogs, comments, attachments, dependencies] =
    await Promise.all([
      db.collection('taskactivities').countDocuments(taskFilter),
      db.collection('worklogs').countDocuments(taskFilter),
      db.collection('comments').countDocuments(targetFilter),
      db.collection('attachments').countDocuments(targetFilter),
      db.collection('taskdependencies').countDocuments(dependencyFilter),
    ]);

  return { taskActivities, workLogs, comments, attachments, dependencies };
}

function printPreflight(preflightResult: Preflight): void {
  console.log(`Tasks to move: ${preflightResult.tasks.length}`);
  console.log(
    `Related records: ${JSON.stringify(preflightResult.relatedCounts)}`,
  );
  if (preflightResult.blockers.length) {
    console.error('Preflight blocked:');
    for (const blocker of preflightResult.blockers)
      console.error(`- ${blocker}`);
  } else {
    console.log('Preflight passed. No database changes have been made.');
  }
}

export async function applyMove(
  db: mongoose.mongo.Db,
  preflightResult: Preflight,
): Promise<void> {
  const sourceWorkspaceId = new Types.ObjectId(SOURCE_WORKSPACE_ID);
  const targetWorkspaceId = new Types.ObjectId(TARGET_WORKSPACE_ID);
  const taskFilter = {
    workspaceId: sourceWorkspaceId,
    isDeleted: { $ne: true },
    $or: preflightResult.tasks.map(task => ({
      _id: task._id,
      key: task.key,
      assigneeId: task.assigneeId ?? null,
      reporterId: task.reporterId ?? null,
      labelIds: task.labelIds ?? null,
      epicId: task.epicId ?? null,
      parentId: task.parentId ?? null,
      updatedAt: task.updatedAt ?? null,
    })),
  };
  const taskRelationFilter = {
    workspaceId: sourceWorkspaceId,
    taskId: { $in: preflightResult.taskIds },
  };
  const targetRelationFilter = {
    workspaceId: sourceWorkspaceId,
    targetType: 'task',
    targetId: { $in: preflightResult.taskIdStrings },
  };
  const dependencyFilter = {
    workspaceId: sourceWorkspaceId,
    fromTaskId: { $in: preflightResult.taskIds },
    toTaskId: { $in: preflightResult.taskIds },
  };

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const results = [
        await db
          .collection('tasks')
          .updateMany(taskFilter, buildTaskUpdate(targetWorkspaceId), {
            session,
          }),
        await db
          .collection('taskactivities')
          .updateMany(
            taskRelationFilter,
            { $set: { workspaceId: targetWorkspaceId } },
            { session },
          ),
        await db
          .collection('worklogs')
          .updateMany(
            taskRelationFilter,
            { $set: { workspaceId: targetWorkspaceId } },
            { session },
          ),
        await db
          .collection('comments')
          .updateMany(
            targetRelationFilter,
            { $set: { workspaceId: targetWorkspaceId } },
            { session },
          ),
        await db
          .collection('attachments')
          .updateMany(
            targetRelationFilter,
            { $set: { workspaceId: targetWorkspaceId } },
            { session },
          ),
        await db
          .collection('taskdependencies')
          .updateMany(
            dependencyFilter,
            { $set: { workspaceId: targetWorkspaceId } },
            { session },
          ),
      ];

      const expectedCounts = [
        preflightResult.tasks.length,
        preflightResult.relatedCounts.taskActivities,
        preflightResult.relatedCounts.workLogs,
        preflightResult.relatedCounts.comments,
        preflightResult.relatedCounts.attachments,
        preflightResult.relatedCounts.dependencies,
      ];
      for (const [index, result] of results.entries()) {
        if (result.matchedCount !== expectedCounts[index]) {
          throw new Error(
            `Concurrent data change detected for migration step ${index + 1}: expected ${expectedCounts[index]}, matched ${result.matchedCount}`,
          );
        }
      }
    });
  } finally {
    await session.endSession();
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const mongoUri =
    process.env.MONGODB_URI ??
    process.env.DATABASE_URL ??
    process.env.DB_CONNECTION_STRING;
  if (!mongoUri) {
    throw new Error(
      'Missing MONGODB_URI, DATABASE_URL, or DB_CONNECTION_STRING',
    );
  }

  await mongoose.connect(mongoUri);
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection is unavailable');

    const preflightResult = await preflight(db);
    printPreflight(preflightResult);
    if (preflightResult.blockers.length) process.exitCode = 1;
    if (!options.apply || preflightResult.blockers.length) return;

    await applyMove(db, preflightResult);
    console.log(
      `Moved ${preflightResult.tasks.length} task(s) to NFC Platform backlog.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  void main().catch(async error => {
    console.error(error);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}
