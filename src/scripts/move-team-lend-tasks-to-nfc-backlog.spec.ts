import mongoose, { Types } from 'mongoose';
import {
  APPLY_CONFIRMATION,
  buildTaskUpdate,
  applyMove,
  preflight,
  parseOptions,
  SOURCE_WORKSPACE_ID,
  TARGET_WORKSPACE_ID,
} from '../../scripts/move-team-lend-tasks-to-nfc-backlog';

describe('move-team-lend-tasks-to-nfc-backlog', () => {
  afterEach(() => jest.restoreAllMocks());

  it('aborts when task relationships change after preview', async () => {
    const taskId = new Types.ObjectId();
    const parentId = new Types.ObjectId();
    const labelId = new Types.ObjectId();
    const endSession = jest.fn();
    jest.spyOn(mongoose, 'startSession').mockResolvedValue({
      withTransaction: async (write: () => Promise<void>) => write(),
      endSession,
    } as never);
    const db = {
      collection: (name: string) => ({
        updateMany: async (filter: Record<string, unknown>) => {
          if (name !== 'tasks') return { matchedCount: 0 };
          const snapshots = filter.$or as
            | Array<Record<string, unknown>>
            | undefined;
          if (!snapshots) return { matchedCount: 1 };
          expect(snapshots[0]).toMatchObject({
            _id: taskId,
            parentId,
            labelIds: [labelId],
            updatedAt: null,
            assigneeId: null,
            reporterId: null,
            epicId: null,
          });
          // A changed label/parent no longer matches the preview snapshot.
          return { matchedCount: 0 };
        },
      }),
    };
    await expect(
      applyMove(db as never, {
        tasks: [
          {
            _id: taskId,
            workspaceId: new Types.ObjectId(SOURCE_WORKSPACE_ID),
            key: 'TLT-1',
            parentId,
            labelIds: [labelId],
          },
        ],
        taskIds: [taskId],
        taskIdStrings: [taskId.toString()],
        blockers: [],
        relatedCounts: {
          taskActivities: 0,
          workLogs: 0,
          comments: 0,
          attachments: 0,
          dependencies: 0,
        },
      }),
    ).rejects.toThrow('Concurrent data change detected');
    expect(endSession).toHaveBeenCalled();
  });

  it('blocks a move when a task left behind points at a moved parent or epic', async () => {
    const taskId = new Types.ObjectId();
    const db = {
      collection: (name: string) => ({
        findOne: async (filter: { _id: Types.ObjectId }) =>
          filter._id.toString() === SOURCE_WORKSPACE_ID
            ? { name: 'Team Lend Trust', type: 'kanban' }
            : { name: 'NFC Platform', type: 'scrum' },
        find: (filter: Record<string, unknown>) => {
          const records =
            name !== 'tasks'
              ? []
              : filter._id
                ? [
                    {
                      _id: new Types.ObjectId(),
                      key: 'TLT-2',
                      parentId: taskId,
                    },
                  ]
                : filter.key
                  ? []
                  : [{ _id: taskId, key: 'TLT-1' }];
          const cursor = {
            toArray: async () => records,
            project: () => cursor,
          };
          return cursor;
        },
        countDocuments: async () => 0,
      }),
    };
    const result = await preflight(db as never);
    expect(result.blockers).toContain(
      'One or more tasks outside the move set reference a moved parent or epic',
    );
  });

  it('executes transaction writes sequentially and closes the session', async () => {
    let writing = false;
    const endSession = jest.fn();
    const session = {
      withTransaction: async (write: () => Promise<void>) => write(),
      endSession,
    };
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
    const db = {
      collection: () => ({
        updateMany: async () => {
          if (writing) throw new Error('Concurrent writes in transaction');
          writing = true;
          await Promise.resolve();
          writing = false;
          return { matchedCount: 1 };
        },
      }),
    };
    await expect(
      applyMove(db as never, {
        tasks: [
          {
            _id: new Types.ObjectId(),
            workspaceId: new Types.ObjectId(SOURCE_WORKSPACE_ID),
            key: 'TLT-1',
          },
        ],
        taskIds: [],
        taskIdStrings: [],
        blockers: [],
        relatedCounts: {
          taskActivities: 1,
          workLogs: 1,
          comments: 1,
          attachments: 1,
          dependencies: 1,
        },
      }),
    ).resolves.toBeUndefined();
    expect(endSession).toHaveBeenCalled();
  });
  it('defaults to a read-only preview', () => {
    expect(parseOptions([])).toEqual({ apply: false });
  });

  it('requires the exact confirmation before applying', () => {
    expect(() => parseOptions(['--apply'])).toThrow(
      `Use --apply --confirm=${APPLY_CONFIRMATION} to write changes`,
    );
  });

  it('moves a task into the NFC Scrum backlog and clears Kanban state', () => {
    const update = buildTaskUpdate(new Types.ObjectId(TARGET_WORKSPACE_ID));

    expect(update.$set).toMatchObject({
      workspaceId: new Types.ObjectId(TARGET_WORKSPACE_ID),
      sprintId: null,
      columnId: 'todo',
      status: 'todo',
    });
    expect(update.$unset).toEqual({ boardId: '', rank: '' });
    expect(SOURCE_WORKSPACE_ID).toBe('6a6abd913e87525f151bd340');
  });
});
