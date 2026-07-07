import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SprintLifecycleService } from './sprint-lifecycle.service';
import { BoardStatusService } from './board-status.service';
import { Sprint } from '../schemas/sprint.schema';
import { Task } from '../../tasks/schemas/task.schema';

describe('SprintLifecycleService', () => {
  let service: SprintLifecycleService;
  let sprintModel: any;
  let taskModel: any;
  let _boardStatusService: jest.Mocked<BoardStatusService>;

  const mockQuery = (val: any) => ({
    exec: jest.fn().mockResolvedValue(val),
    session: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintLifecycleService,
        {
          provide: BoardStatusService,
          useValue: {
            getCompletedStatuses: jest.fn().mockResolvedValue(['done']),
          },
        },
        {
          provide: getModelToken(Sprint.name),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            findById: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getModelToken(Task.name),
          useValue: {
            find: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
              }),
            }),
            updateMany: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SprintLifecycleService>(SprintLifecycleService);
    sprintModel = module.get(getModelToken(Sprint.name));
    taskModel = module.get(getModelToken(Task.name));
    _boardStatusService = module.get(BoardStatusService);
  });

  describe('startSprint', () => {
    const workspaceId = new Types.ObjectId().toString();
    const sprintId = new Types.ObjectId().toString();
    const dto = {
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 86400000 * 14).toISOString(), // 2 weeks later
    };

    it('throws NotFoundException when sprint does not exist', async () => {
      sprintModel.findOne.mockReturnValue(mockQuery(null));

      await expect(
        service.startSprint(workspaceId, sprintId, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when sprint status is not planning', async () => {
      const mockSprint = {
        _id: new Types.ObjectId(sprintId),
        status: 'active',
      };
      sprintModel.findOne.mockReturnValue(mockQuery(mockSprint));

      await expect(
        service.startSprint(workspaceId, sprintId, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when there is already an active sprint in the workspace', async () => {
      const mockSprint = {
        _id: new Types.ObjectId(sprintId),
        status: 'planning',
      };
      sprintModel.findOne
        .mockReturnValueOnce(mockQuery(mockSprint)) // first call for target sprint
        .mockReturnValueOnce(
          mockQuery({ _id: new Types.ObjectId(), status: 'active' }),
        ); // second call for existing active sprint

      await expect(
        service.startSprint(workspaceId, sprintId, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully starts the sprint', async () => {
      const saveSpy = jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(sprintId),
        status: 'active',
      });
      const mockSprint = {
        _id: new Types.ObjectId(sprintId),
        status: 'planning',
        startDate: null,
        endDate: null,
        startedAt: null,
        save: saveSpy,
      };

      sprintModel.findOne
        .mockReturnValueOnce(mockQuery(mockSprint)) // target sprint
        .mockReturnValueOnce(mockQuery(null)); // no existing active sprint

      const result = await service.startSprint(workspaceId, sprintId, dto);

      expect(mockSprint.status).toBe('active');
      expect(mockSprint.startDate).toBeInstanceOf(Date);
      expect(mockSprint.endDate).toBeInstanceOf(Date);
      expect(mockSprint.startedAt).toBeInstanceOf(Date);
      expect(saveSpy).toHaveBeenCalledWith();
      expect(result).toBeDefined();
    });
  });

  describe('completeSprint', () => {
    const workspaceId = new Types.ObjectId().toString();
    const sprintId = new Types.ObjectId().toString();

    it('throws NotFoundException when sprint does not exist', async () => {
      sprintModel.findOne.mockReturnValue(mockQuery(null));

      await expect(
        service.completeSprint(workspaceId, sprintId, {
          moveToSprintId: undefined,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when sprint is not active', async () => {
      const mockSprint = {
        _id: new Types.ObjectId(sprintId),
        status: 'planning',
      };
      sprintModel.findOne.mockReturnValue(mockQuery(mockSprint));

      await expect(
        service.completeSprint(workspaceId, sprintId, {
          moveToSprintId: undefined,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when moveToSprintId does not exist or is not in planning', async () => {
      const mockSprint = {
        _id: new Types.ObjectId(sprintId),
        status: 'active',
      };
      const moveToSprintId = new Types.ObjectId().toString();

      sprintModel.findOne
        .mockReturnValueOnce(mockQuery(mockSprint)) // target sprint
        .mockReturnValueOnce(mockQuery(null)); // invalid target sprint

      await expect(
        service.completeSprint(workspaceId, sprintId, { moveToSprintId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('completes sprint and moves incomplete tasks back to backlog (moveToSprintId is undefined)', async () => {
      const saveSpy = jest.fn().mockImplementation(function (this: any) {
        return Promise.resolve(this);
      });
      const mockSprint = {
        _id: new Types.ObjectId(sprintId),
        workspaceId: new Types.ObjectId(workspaceId),
        name: 'Sprint 1',
        status: 'active',
        completedAt: null,
        save: saveSpy,
      };

      sprintModel.findOne.mockReturnValue(mockQuery(mockSprint));
      taskModel.updateMany.mockReturnValue(mockQuery({ modifiedCount: 3 }));

      const result = await service.completeSprint(workspaceId, sprintId, {
        moveToSprintId: undefined,
      });

      expect(mockSprint.status).toBe('completed');
      expect(mockSprint.completedAt).toBeInstanceOf(Date);
      expect(taskModel.updateMany).toHaveBeenCalledWith(
        {
          workspaceId: new Types.ObjectId(workspaceId),
          sprintId: new Types.ObjectId(sprintId),
          isDeleted: { $ne: true },
          status: { $nin: ['done'] },
        },
        {
          $set: {
            sprintId: null,
            columnId: 'todo',
            status: 'todo',
          },
        },
      );
      expect(saveSpy).toHaveBeenCalledWith();
      expect(result.incompleteTasksMovedTo).toBeNull();
    });

    it('completes sprint and moves incomplete tasks to another planning sprint', async () => {
      const saveSpy = jest.fn().mockImplementation(function (this: any) {
        return Promise.resolve(this);
      });
      const mockSprint = {
        _id: new Types.ObjectId(sprintId),
        workspaceId: new Types.ObjectId(workspaceId),
        name: 'Sprint 1',
        status: 'active',
        completedAt: null,
        save: saveSpy,
      };

      const moveToSprintId = new Types.ObjectId().toString();
      const mockTargetSprint = {
        _id: new Types.ObjectId(moveToSprintId),
        status: 'planning',
      };

      sprintModel.findOne
        .mockReturnValueOnce(mockQuery(mockSprint)) // target sprint
        .mockReturnValueOnce(mockQuery(mockTargetSprint)); // target planning sprint

      taskModel.updateMany.mockReturnValue(mockQuery({ modifiedCount: 2 }));

      const result = await service.completeSprint(workspaceId, sprintId, {
        moveToSprintId,
      });

      expect(mockSprint.status).toBe('completed');
      expect(taskModel.updateMany).toHaveBeenCalledWith(
        {
          workspaceId: new Types.ObjectId(workspaceId),
          sprintId: new Types.ObjectId(sprintId),
          isDeleted: { $ne: true },
          status: { $nin: ['done'] },
        },
        {
          $set: {
            sprintId: new Types.ObjectId(moveToSprintId),
          },
        },
      );
      expect(result.incompleteTasksMovedTo).toEqual(
        new Types.ObjectId(moveToSprintId),
      );
    });
  });
});
