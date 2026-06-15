import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SprintTaskMovementService } from './sprint-task-movement.service';
import { Sprint } from '../schemas/sprint.schema';
import { Task } from '../../tasks/schemas/task.schema';

describe('SprintTaskMovementService', () => {
  let service: SprintTaskMovementService;
  let sprintModel: any;
  let taskModel: any;

  const mockQuery = (val: any) => ({
    exec: jest.fn().mockResolvedValue(val),
    lean: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintTaskMovementService,
        {
          provide: getModelToken(Sprint.name),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getModelToken(Task.name),
          useValue: {
            find: jest.fn(),
            countDocuments: jest.fn(),
            updateMany: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SprintTaskMovementService>(SprintTaskMovementService);
    sprintModel = module.get(getModelToken(Sprint.name));
    taskModel = module.get(getModelToken(Task.name));
  });

  describe('moveTasksToSprint', () => {
    const workspaceId = new Types.ObjectId().toString();
    const sprintId = new Types.ObjectId().toString();
    const taskIds = [
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
    ];

    it('throws BadRequestException if taskIds is empty', async () => {
      await expect(
        service.moveTasksToSprint(workspaceId, sprintId, []),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if some tasks do not exist, are deleted, or belong to other workspace', async () => {
      taskModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(taskIds.length - 1), // mismatch count
      });

      await expect(
        service.moveTasksToSprint(workspaceId, sprintId, taskIds),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if target sprint does not exist', async () => {
      // ownership check success
      taskModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(taskIds.length),
      });
      // sprint check return null
      sprintModel.findOne.mockReturnValue(mockQuery(null));

      await expect(
        service.moveTasksToSprint(workspaceId, sprintId, taskIds),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if target sprint is already completed', async () => {
      taskModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(taskIds.length),
      });
      sprintModel.findOne.mockReturnValue(
        mockQuery({ _id: new Types.ObjectId(sprintId), status: 'completed' }),
      );

      await expect(
        service.moveTasksToSprint(workspaceId, sprintId, taskIds),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if non-admin tries to move task from a completed sprint', async () => {
      taskModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(taskIds.length),
      });
      sprintModel.findOne.mockReturnValue(
        mockQuery({ _id: new Types.ObjectId(sprintId), status: 'active' }),
      );

      // tasks being moved belong to a completed sprint
      const mockTasksWithSprints = [
        { _id: new Types.ObjectId(taskIds[0]), sprintId: new Types.ObjectId() },
      ];
      taskModel.find.mockReturnValue(mockQuery(mockTasksWithSprints));

      sprintModel.findOne
        .mockReturnValueOnce(
          mockQuery({ _id: new Types.ObjectId(sprintId), status: 'active' }),
        ) // target sprint check
        .mockReturnValueOnce(
          mockQuery({ _id: new Types.ObjectId(), status: 'completed' }),
        ); // source sprint check (completed)

      await expect(
        service.moveTasksToSprint(workspaceId, sprintId, taskIds, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully moves tasks to sprint (non-admin, no completed source sprints)', async () => {
      taskModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(taskIds.length),
      });
      sprintModel.findOne.mockReturnValue(
        mockQuery({ _id: new Types.ObjectId(sprintId), status: 'active' }),
      );

      // tasks being moved have no sprint (from backlog)
      taskModel.find.mockReturnValue(mockQuery([]));
      taskModel.updateMany.mockReturnValue(
        mockQuery({ modifiedCount: taskIds.length }),
      );

      const result = await service.moveTasksToSprint(
        workspaceId,
        sprintId,
        taskIds,
        false,
      );

      expect(taskModel.updateMany).toHaveBeenCalledWith(
        {
          _id: { $in: taskIds.map(id => new Types.ObjectId(id)) },
          workspaceId: new Types.ObjectId(workspaceId),
        },
        { $set: { sprintId: new Types.ObjectId(sprintId) } },
      );
      expect(result.modifiedCount).toBe(taskIds.length);
    });
  });

  describe('moveTasksToBacklog', () => {
    const workspaceId = new Types.ObjectId().toString();
    const taskIds = [new Types.ObjectId().toString()];

    it('successfully moves tasks to backlog and resets their status/columnId', async () => {
      taskModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(taskIds.length),
      });
      taskModel.find.mockReturnValue(mockQuery([])); // not from completed sprint
      taskModel.updateMany.mockReturnValue(
        mockQuery({ modifiedCount: taskIds.length }),
      );

      const result = await service.moveTasksToBacklog(
        workspaceId,
        taskIds,
        false,
      );

      expect(taskModel.updateMany).toHaveBeenCalledWith(
        {
          _id: { $in: taskIds.map(id => new Types.ObjectId(id)) },
          workspaceId: new Types.ObjectId(workspaceId),
        },
        {
          $set: {
            sprintId: null,
            columnId: 'todo',
            status: 'todo',
          },
        },
      );
      expect(result.modifiedCount).toBe(taskIds.length);
    });
  });
});
