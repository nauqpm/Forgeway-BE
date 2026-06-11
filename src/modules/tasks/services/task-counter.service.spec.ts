import { Types } from 'mongoose';
import { TaskCounterService } from './task-counter.service';

describe('TaskCounterService', () => {
  let service: TaskCounterService;
  let taskCounterModel: { findOneAndUpdate: jest.Mock; create: jest.Mock };
  let taskModel: { countDocuments: jest.Mock };

  const workspaceId = new Types.ObjectId().toString();

  beforeEach(() => {
    taskCounterModel = {
      findOneAndUpdate: jest.fn(),
      create: jest.fn(),
    };
    taskModel = {
      countDocuments: jest.fn(),
    };

    service = new TaskCounterService(taskCounterModel as any, taskModel as any);
  });

  it('increments an existing workspace counter atomically', async () => {
    taskCounterModel.findOneAndUpdate.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue({ taskSequence: 12 }),
    });

    await expect(service.nextSequence(workspaceId)).resolves.toBe(12);

    expect(taskCounterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { workspaceId: expect.any(Types.ObjectId) },
      { $inc: { taskSequence: 1 } },
      { new: true },
    );
    expect(taskModel.countDocuments).not.toHaveBeenCalled();
    expect(taskCounterModel.create).not.toHaveBeenCalled();
  });

  it('initializes from existing task count before incrementing', async () => {
    taskCounterModel.findOneAndUpdate
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue({ taskSequence: 6 }),
      });
    taskModel.countDocuments.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue(5),
    });
    taskCounterModel.create.mockResolvedValueOnce({ taskSequence: 5 });

    await expect(service.nextSequence(workspaceId)).resolves.toBe(6);

    expect(taskModel.countDocuments).toHaveBeenCalledWith({
      workspaceId: expect.any(Types.ObjectId),
    });
    expect(taskCounterModel.create).toHaveBeenCalledWith({
      workspaceId: expect.any(Types.ObjectId),
      taskSequence: 5,
    });
    expect(taskCounterModel.findOneAndUpdate).toHaveBeenLastCalledWith(
      { workspaceId: expect.any(Types.ObjectId) },
      { $inc: { taskSequence: 1 } },
      { new: true },
    );
  });
});
