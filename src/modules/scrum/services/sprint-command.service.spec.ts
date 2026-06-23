import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SprintCommandService } from './sprint-command.service';
import { SprintDomainEventPublisher } from './sprint-domain-event.publisher';
import { Sprint } from '../schemas/sprint.schema';
import { Task } from '../../tasks/schemas/task.schema';

describe('SprintCommandService', () => {
  let service: SprintCommandService;
  let sprintModel: any;
  let taskModel: any;
  let sprintDomainEventPublisher: { publishCreated: jest.Mock };

  const mockQuery = (val: any) => ({
    exec: jest.fn().mockResolvedValue(val),
    session: jest.fn().mockReturnThis(),
    countDocuments: jest.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintCommandService,
        {
          provide: getModelToken(Sprint.name),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            findById: jest.fn(),
            countDocuments: jest.fn(),
            exists: jest.fn(),
            deleteOne: jest.fn(),
            deleteMany: jest.fn(),
            updateMany: jest.fn(),
          },
        },
        {
          provide: getModelToken(Task.name),
          useValue: {
            updateMany: jest.fn(),
          },
        },
        {
          provide: SprintDomainEventPublisher,
          useValue: {
            publishCreated: jest.fn(),
          },
        },
      ],
    }).compile();

    sprintDomainEventPublisher = {
      publishCreated: jest.fn(),
    };

    // Mock constructor behavior for model creation
    sprintModel = module.get(getModelToken(Sprint.name));
    sprintModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(2),
    });
    sprintModel.exists.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    // Define mock class for Sprint model constructor
    const mockSprintInstance = function (this: any, data: any) {
      Object.assign(this, data);
      this.save = jest.fn().mockResolvedValue(this);
    };
    Object.assign(mockSprintInstance, sprintModel);

    // Replace injected model token with mock constructor
    service = new SprintCommandService(
      mockSprintInstance as any,
      module.get(getModelToken(Task.name)),
      sprintDomainEventPublisher as any,
    );

    // Save reference to mock constructor for test validation
    sprintModel = mockSprintInstance;
    taskModel = module.get(getModelToken(Task.name));
  });

  describe('createSprint', () => {
    const workspaceId = new Types.ObjectId().toString();

    it('creates sprint with auto-generated name if omitted', async () => {
      const dto = { goal: 'Test goals' };
      const result = await service.createSprint(workspaceId, dto);

      expect(sprintModel.countDocuments).toHaveBeenCalledWith({
        workspaceId: new Types.ObjectId(workspaceId),
        deletedAt: null,
      });
      expect(result.name).toBe('Sprint 3'); // 2 existing + 1
      expect(result.status).toBe('planning');
      expect(result.workspaceId).toEqual(new Types.ObjectId(workspaceId));
      expect(sprintDomainEventPublisher.publishCreated).toHaveBeenCalledWith(
        result,
        undefined,
      );
    });

    it('creates sprint with specified name', async () => {
      const dto = { name: 'Custom Sprint Name', goal: 'Test goals' };
      const actorId = new Types.ObjectId().toString();
      const result = await service.createSprint(workspaceId, dto, actorId);

      expect(result.name).toBe('Custom Sprint Name');
      expect(sprintDomainEventPublisher.publishCreated).toHaveBeenCalledWith(
        result,
        actorId,
      );
    });

    it('throws BadRequestException when sprint name already exists in workspace', async () => {
      sprintModel.exists.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      });
      const dto = { name: 'Sprint 3' };
      await expect(
        service.createSprint(workspaceId, dto as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateSprint', () => {
    const workspaceId = new Types.ObjectId().toString();
    const sprintId = new Types.ObjectId().toString();

    it('throws NotFoundException if sprint not found', async () => {
      sprintModel.findOne.mockReturnValue(mockQuery(null));
      await expect(
        service.updateSprint(workspaceId, sprintId, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when updating a completed sprint', async () => {
      const mockSprint = {
        _id: new Types.ObjectId(sprintId),
        status: 'completed',
      };
      sprintModel.findOne.mockReturnValue(mockQuery(mockSprint));

      await expect(
        service.updateSprint(workspaceId, sprintId, { name: 'New Name' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when trying to update dates of non-planning sprint', async () => {
      const mockSprint = {
        _id: new Types.ObjectId(sprintId),
        status: 'active',
      };
      sprintModel.findOne.mockReturnValue(mockQuery(mockSprint));

      await expect(
        service.updateSprint(workspaceId, sprintId, {
          startDate: new Date().toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when endDate is before startDate', async () => {
      const mockSprint = {
        _id: new Types.ObjectId(sprintId),
        status: 'planning',
        startDate: new Date('2026-06-10'),
        endDate: new Date('2026-06-20'),
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };
      sprintModel.findOne.mockReturnValue(mockQuery(mockSprint));

      await expect(
        service.updateSprint(workspaceId, sprintId, {
          endDate: new Date('2026-06-05').toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when renaming to an existing sprint name', async () => {
      const mockSprint: any = {
        _id: new Types.ObjectId(sprintId),
        status: 'planning',
        name: 'Sprint Old Name',
      };
      sprintModel.findOne.mockReturnValue(mockQuery(mockSprint));
      sprintModel.exists.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      });

      await expect(
        service.updateSprint(workspaceId, sprintId, { name: 'Sprint 3' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully updates planning sprint details', async () => {
      const saveSpy = jest.fn().mockImplementation(function (this: any) {
        return Promise.resolve(this);
      });
      const mockSprint: any = {
        _id: new Types.ObjectId(sprintId),
        status: 'planning',
        name: 'Sprint Old Name',
        save: saveSpy,
      };
      sprintModel.findOne.mockReturnValue(mockQuery(mockSprint));

      const dto = { name: 'Sprint New Name', goal: 'New Sprint Goal' };
      const result = await service.updateSprint(workspaceId, sprintId, dto);

      expect(mockSprint.name).toBe('Sprint New Name');
      expect(mockSprint.goal).toBe('New Sprint Goal');
      expect(saveSpy).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('deleteSprint', () => {
    const workspaceId = new Types.ObjectId().toString();
    const sprintId = new Types.ObjectId().toString();

    it('throws NotFoundException when deleting non-existent sprint', async () => {
      sprintModel.findOne.mockReturnValue(mockQuery(null));
      await expect(service.deleteSprint(workspaceId, sprintId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when deleting a non-planning sprint', async () => {
      const mockSprint = {
        _id: new Types.ObjectId(sprintId),
        status: 'active',
      };
      sprintModel.findOne.mockReturnValue(mockQuery(mockSprint));

      await expect(service.deleteSprint(workspaceId, sprintId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('successfully deletes planning sprint and resets its tasks to backlog', async () => {
      const mockSprint = {
        _id: new Types.ObjectId(sprintId),
        status: 'planning',
      };
      sprintModel.findOne.mockReturnValue(mockQuery(mockSprint));
      sprintModel.deleteOne = jest
        .fn()
        .mockReturnValue(mockQuery({ deletedCount: 1 }));
      taskModel.updateMany.mockReturnValue(mockQuery({ modifiedCount: 5 }));

      await service.deleteSprint(workspaceId, sprintId);

      expect(taskModel.updateMany).toHaveBeenCalledWith(
        {
          workspaceId: new Types.ObjectId(workspaceId),
          sprintId: mockSprint._id,
        },
        {
          $set: {
            sprintId: null,
            columnId: 'todo',
            status: 'todo',
          },
        },
      );
      expect(sprintModel.deleteOne).toHaveBeenCalledWith({
        _id: mockSprint._id,
      });
    });
  });

  describe('workspace-scoped sprint soft delete and restore', () => {
    const workspaceId = new Types.ObjectId().toString();

    it('soft deletes sprints for a workspace', async () => {
      sprintModel.updateMany.mockReturnValue(mockQuery({ modifiedCount: 2 }));

      await service.deleteByWorkspace(workspaceId);

      expect(sprintModel.updateMany).toHaveBeenCalledWith(
        {
          workspaceId: new Types.ObjectId(workspaceId),
          deletedAt: null,
        },
        { $set: { deletedAt: expect.any(Date) } },
      );
    });

    it('restores soft-deleted sprints for a workspace', async () => {
      sprintModel.updateMany.mockReturnValue(mockQuery({ modifiedCount: 2 }));

      await service.restoreByWorkspace(workspaceId);

      expect(sprintModel.updateMany).toHaveBeenCalledWith(
        {
          workspaceId: new Types.ObjectId(workspaceId),
          deletedAt: { $ne: null },
        },
        { $set: { deletedAt: null } },
      );
    });
  });
});
