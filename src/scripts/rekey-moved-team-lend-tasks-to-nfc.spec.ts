import mongoose, { Types } from 'mongoose';
import {
  APPLY_CONFIRMATION,
  createWorkspaceKeyPrefix,
  parseOptions,
  applyRekey,
} from '../../scripts/rekey-moved-team-lend-tasks-to-nfc';

describe('rekey-moved-team-lend-tasks-to-nfc', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rebuilds search fields when changing a task key', async () => {
    const endSession = jest.fn();
    jest.spyOn(mongoose, 'startSession').mockResolvedValue({
      withTransaction: async (write: () => Promise<unknown>) => write(),
      endSession,
    } as never);
    const bulkWrite = jest.fn().mockResolvedValue({ matchedCount: 1 });
    const db = {
      collection: () => ({
        findOneAndUpdate: async () => ({ taskSequence: 11 }),
        bulkWrite,
      }),
    };
    await applyRekey(db as never, {
      tasks: [
        {
          _id: new Types.ObjectId(),
          workspaceId: new Types.ObjectId(),
          key: 'TLT-1',
          title: 'Café task',
          description: 'Useful details',
        },
      ],
      sourcePrefix: 'TLT',
      targetPrefix: 'NFC',
      maxTargetSequence: 10,
      taskSequence: 10,
      relatedCounts: { taskActivities: 1, workLogs: 1 },
      blockers: [],
    });
    const update = bulkWrite.mock.calls[0][0][0].updateOne.update.$set;
    expect(update).toMatchObject({
      key: 'NFC-11',
      searchText: 'nfc 11 cafe task useful details',
    });
    expect(update.searchTokens).toContain('nfc');
    expect(update.searchTokens).not.toContain('tlt');
    expect(endSession).toHaveBeenCalled();
  });
  it('uses the NFC workspace key as its task-key prefix', () => {
    expect(createWorkspaceKeyPrefix('NFC1')).toBe('NFC1');
  });

  it('defaults to a read-only preview', () => {
    expect(parseOptions([])).toEqual({ apply: false });
  });

  it('requires the exact confirmation before applying', () => {
    expect(() => parseOptions(['--apply'])).toThrow(
      `Use --apply --confirm=${APPLY_CONFIRMATION} to write changes`,
    );
  });
});
