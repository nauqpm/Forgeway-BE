import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { buildTaskSearchTokens } from '../src/modules/tasks/utils/search-token.util';
import { normalizeForSearch } from '../src/common/utils/normalizeForSearch';

const SOURCE_WORKSPACE_ID = '6a6abd913e87525f151bd340';
const TARGET_WORKSPACE_ID = '6a76af6c8fe199366f1b89ca';
export const APPLY_CONFIRMATION = 'REKEY-MOVED-TEAM-LEND-TASKS-IN-NFC';

type ScriptOptions = { apply: boolean };

type WorkspaceRecord = {
  _id: Types.ObjectId;
  name?: string;
  key?: string;
  type?: string;
  deletedAt?: Date | null;
};

type TaskRecord = {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  key: string;
  title?: string;
  description?: string;
  isDeleted?: boolean;
  createdAt?: Date;
};

type TaskCounterRecord = {
  workspaceId: Types.ObjectId;
  taskSequence: number;
};

type KeyMapping = {
  taskId: Types.ObjectId;
  oldKey: string;
  newKey: string;
  title?: string;
  description?: string;
};

type Preflight = {
  tasks: TaskRecord[];
  sourcePrefix: string;
  targetPrefix: string;
  maxTargetSequence: number;
  taskSequence: number;
  relatedCounts: { taskActivities: number; workLogs: number };
  blockers: string[];
};

export function createWorkspaceKeyPrefix(
  workspaceKey: string | undefined,
): string {
  return workspaceKey?.trim().toUpperCase() ?? '';
}

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

function keyPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`);
}

function keySequence(key: string, prefix: string): number {
  return Number(key.slice(prefix.length + 1));
}

function sortTasks(tasks: TaskRecord[], prefix: string): TaskRecord[] {
  return [...tasks].sort((left, right) => {
    const sequenceDifference =
      keySequence(left.key, prefix) - keySequence(right.key, prefix);
    if (sequenceDifference !== 0) return sequenceDifference;
    return left._id.toString().localeCompare(right._id.toString());
  });
}

function createMappings(
  tasks: TaskRecord[],
  sourcePrefix: string,
  targetPrefix: string,
  startSequence: number,
): KeyMapping[] {
  return sortTasks(tasks, sourcePrefix).map((task, index) => ({
    taskId: task._id,
    oldKey: task.key,
    newKey: `${targetPrefix}-${startSequence + index + 1}`,
    title: task.title,
    description: task.description,
  }));
}

async function preflight(db: mongoose.mongo.Db): Promise<Preflight> {
  const sourceWorkspaceId = new Types.ObjectId(SOURCE_WORKSPACE_ID);
  const targetWorkspaceId = new Types.ObjectId(TARGET_WORKSPACE_ID);
  const workspaces = db.collection<WorkspaceRecord>('workspaces');
  const tasksCollection = db.collection<TaskRecord>('tasks');
  const [source, target] = await Promise.all([
    workspaces.findOne({ _id: sourceWorkspaceId, deletedAt: null }),
    workspaces.findOne({ _id: targetWorkspaceId, deletedAt: null }),
  ]);

  const blockers: string[] = [];
  if (!source || source.name?.trim() !== 'Team Lend Trust') {
    blockers.push(
      'Source workspace is not the expected active Team Lend Trust workspace',
    );
  }
  if (!target || target.name !== 'NFC Platform' || target.type !== 'scrum') {
    blockers.push(
      'Target workspace is not the expected active NFC Platform Scrum workspace',
    );
  }

  const sourcePrefix = createWorkspaceKeyPrefix(source?.key);
  const targetPrefix = createWorkspaceKeyPrefix(target?.key);
  if (!sourcePrefix) blockers.push('Team Lend Trust workspace key is missing');
  if (!targetPrefix) blockers.push('NFC Platform workspace key is missing');
  const sourcePattern = keyPattern(sourcePrefix);
  const targetPattern = keyPattern(targetPrefix);
  const [tasks, targetTasks, counter] = await Promise.all([
    tasksCollection
      .find({
        workspaceId: targetWorkspaceId,
        key: sourcePattern,
        isDeleted: { $ne: true },
      })
      .project<TaskRecord>({
        _id: 1,
        workspaceId: 1,
        key: 1,
        title: 1,
        description: 1,
        createdAt: 1,
      })
      .toArray(),
    tasksCollection
      .find({ workspaceId: targetWorkspaceId, key: targetPattern })
      .project<{ key: string }>({ key: 1 })
      .toArray(),
    db
      .collection<TaskCounterRecord>('taskcounters')
      .findOne({ workspaceId: targetWorkspaceId }),
  ]);

  if (!tasks.length) {
    blockers.push(
      `No non-deleted ${sourcePrefix}-* tasks were found in NFC Platform`,
    );
  }
  if (
    tasks.some(
      task => !Number.isSafeInteger(keySequence(task.key, sourcePrefix)),
    )
  ) {
    blockers.push(
      'One or more moved task keys do not have a valid numeric suffix',
    );
  }

  const maxTargetSequence = Math.max(
    0,
    ...targetTasks.map(task => keySequence(task.key, targetPrefix)),
  );
  const taskSequence = Math.max(counter?.taskSequence ?? 0, maxTargetSequence);
  const taskIds = tasks.map(task => task._id);
  const [taskActivities, workLogs] = await Promise.all([
    db
      .collection('taskactivities')
      .countDocuments({
        workspaceId: targetWorkspaceId,
        taskId: { $in: taskIds },
      }),
    db
      .collection('worklogs')
      .countDocuments({
        workspaceId: targetWorkspaceId,
        taskId: { $in: taskIds },
      }),
  ]);

  return {
    tasks,
    sourcePrefix,
    targetPrefix,
    maxTargetSequence,
    taskSequence,
    relatedCounts: { taskActivities, workLogs },
    blockers,
  };
}

function printPreflight(preflightResult: Preflight): void {
  const mappings = createMappings(
    preflightResult.tasks,
    preflightResult.sourcePrefix,
    preflightResult.targetPrefix,
    preflightResult.taskSequence,
  );
  console.log(
    `Tasks to re-key: ${mappings.length}; ${preflightResult.sourcePrefix}-* -> ${preflightResult.targetPrefix}-*`,
  );
  console.log(
    `Related records: ${JSON.stringify(preflightResult.relatedCounts)}`,
  );
  console.log(
    `Preview mapping: ${JSON.stringify(
      mappings.map(({ oldKey, newKey }) => ({ oldKey, newKey })),
    )}`,
  );
  if (preflightResult.blockers.length) {
    console.error('Preflight blocked:');
    for (const blocker of preflightResult.blockers)
      console.error(`- ${blocker}`);
  } else {
    console.log('Preflight passed. No database changes have been made.');
  }
}

export async function applyRekey(
  db: mongoose.mongo.Db,
  preflightResult: Preflight,
): Promise<KeyMapping[]> {
  const targetWorkspaceId = new Types.ObjectId(TARGET_WORKSPACE_ID);
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const counter = await db
        .collection<TaskCounterRecord>('taskcounters')
        .findOneAndUpdate(
          { workspaceId: targetWorkspaceId },
          [
            {
              $set: {
                taskSequence: {
                  $add: [
                    {
                      $max: [
                        { $ifNull: ['$taskSequence', 0] },
                        preflightResult.maxTargetSequence,
                      ],
                    },
                    preflightResult.tasks.length,
                  ],
                },
              },
            },
          ],
          { upsert: true, returnDocument: 'after', session },
        );
      if (!counter || !Number.isSafeInteger(counter.taskSequence)) {
        throw new Error('Failed to reserve NFC Platform task key sequences');
      }

      const mappings = createMappings(
        preflightResult.tasks,
        preflightResult.sourcePrefix,
        preflightResult.targetPrefix,
        counter.taskSequence - preflightResult.tasks.length,
      );
      const taskResult = await db.collection('tasks').bulkWrite(
        mappings.map(mapping => ({
          updateOne: {
            filter: {
              _id: mapping.taskId,
              workspaceId: targetWorkspaceId,
              key: mapping.oldKey,
              title: mapping.title ?? null,
              description: mapping.description ?? null,
              isDeleted: { $ne: true },
            },
            update: {
              $set: {
                key: mapping.newKey,
                searchTokens: buildTaskSearchTokens(
                  mapping.newKey,
                  mapping.title,
                ),
                searchText: normalizeForSearch(
                  [mapping.newKey, mapping.title, mapping.description].join(
                    ' ',
                  ),
                ),
              },
            },
          },
        })),
        { ordered: true, session },
      );
      if (taskResult.matchedCount !== mappings.length) {
        throw new Error(
          `Concurrent task change detected: expected ${mappings.length}, matched ${taskResult.matchedCount}`,
        );
      }

      const taskIds = mappings.map(mapping => mapping.taskId);
      const activityResult = await db.collection('taskactivities').bulkWrite(
        mappings.map(mapping => ({
          updateMany: {
            filter: { workspaceId: targetWorkspaceId, taskId: mapping.taskId },
            update: { $set: { taskKey: mapping.newKey } },
          },
        })),
        { ordered: true, session },
      );
      const workLogResult = await db.collection('worklogs').bulkWrite(
        mappings.map(mapping => ({
          updateMany: {
            filter: { workspaceId: targetWorkspaceId, taskId: mapping.taskId },
            update: { $set: { taskKey: mapping.newKey } },
          },
        })),
        { ordered: true, session },
      );
      if (
        activityResult.matchedCount !==
          preflightResult.relatedCounts.taskActivities ||
        workLogResult.matchedCount !== preflightResult.relatedCounts.workLogs
      ) {
        throw new Error(
          `Concurrent history change detected for task IDs: ${taskIds.join(', ')}`,
        );
      }

      return mappings;
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

    const mappings = await applyRekey(db, preflightResult);
    console.log(
      `Re-keyed ${mappings.length} task(s) to ${preflightResult.targetPrefix}-*.`,
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
