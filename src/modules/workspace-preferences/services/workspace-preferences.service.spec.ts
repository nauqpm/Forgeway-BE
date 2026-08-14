import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { WorkspacePreferencesService } from './workspace-preferences.service';

const chain = (value: unknown) => ({
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
});

describe('WorkspacePreferencesService', () => {
  const userId = new Types.ObjectId().toString();
  const workspaceId = new Types.ObjectId().toString();
  let preferenceModel: any;
  let workspaceModel: any;
  let service: WorkspacePreferencesService;

  beforeEach(() => {
    preferenceModel = {
      find: jest.fn(() => chain([])),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      bulkWrite: jest.fn().mockResolvedValue({}),
      deleteOne: jest.fn(() => chain({ deletedCount: 1 })),
      deleteMany: jest.fn(() => chain({ deletedCount: 1 })),
    };
    workspaceModel = {
      findOne: jest.fn(() => chain({ _id: workspaceId })),
      countDocuments: jest.fn().mockResolvedValue(1),
    };
    service = new WorkspacePreferencesService(preferenceModel, workspaceModel);
  });

  it('upserts a personal star using both userId and workspaceId', async () => {
    preferenceModel.findOne.mockResolvedValue({ position: 2 });
    preferenceModel.findOneAndUpdate.mockReturnValue(
      chain({ userId, workspaceId, isStarred: true, position: 2 }),
    );

    await service.setStar(userId, workspaceId, true);

    expect(preferenceModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId, workspaceId },
      { $set: { isStarred: true, position: 2 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  });

  it('stores the complete workspace order with deterministic positions', async () => {
    const secondWorkspaceId = new Types.ObjectId().toString();
    workspaceModel.countDocuments.mockResolvedValue(2);

    await service.reorder(userId, [workspaceId, secondWorkspaceId]);

    const operations = preferenceModel.bulkWrite.mock.calls[0][0];
    expect(operations[0].updateOne.update.$set.position).toBe(0);
    expect(operations[1].updateOne.update.$set.position).toBe(1);
    expect(operations[0].updateOne.filter.userId).toBe(userId);
  });

  it('rejects an order containing an inaccessible workspace', async () => {
    workspaceModel.countDocuments.mockResolvedValue(0);

    await expect(service.reorder(userId, [workspaceId])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(preferenceModel.bulkWrite).not.toHaveBeenCalled();
  });
});
