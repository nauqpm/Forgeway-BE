import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { TaskMapper } from '../mappers/task.mapper';
import { TaskReadRepository } from '../repositories/task-read.repository';
import { TaskWriteRepository } from '../repositories/task-write.repository';
import { SubtaskService } from './subtask.service';
import { TaskAccessService } from './task-access.service';
import { TaskCreateService } from './task-create.service';
import { TaskCreationValidationService } from './task-creation-validation.service';
import { TaskDomainEventPublisher } from './task-domain-event.publisher';
import { CreateTaskDto } from '../dtos/requests/create-task.dto';

describe('SubtaskService', () => {
  let service: SubtaskService;
  let taskReadRepository: jest.Mocked<TaskReadRepository>;
  let taskWriteRepository: jest.Mocked<TaskWriteRepository>;
  let taskMapper: jest.Mocked<TaskMapper>;
  let taskCreateService: jest.Mocked<TaskCreateService>;
  let taskAccessService: jest.Mocked<TaskAccessService>;
  let validationService: jest.Mocked<TaskCreationValidationService>;
  let taskActivitiesService: jest.Mocked<TaskActivitiesService>;
  let taskDomainEventPublisher: jest.Mocked<TaskDomainEventPublisher>;

  const userId = new Types.ObjectId().toString();
  const workspaceId = new Types.ObjectId().toString();
  const validObjectId = new Types.ObjectId().toString();

  beforeEach(() => {
    taskReadRepository = {
      findByIdInWorkspace: jest.fn(),
      findSubtasksByParentId: jest.fn(),
      countSubtasksByParentId: jest.fn(),
      countDoneSubtasksByParentId: jest.fn(),
    } as unknown as jest.Mocked<TaskReadRepository>;

    taskWriteRepository = {
      softDeleteInWorkspace: jest.fn(),
      convertToTask: jest.fn(),
      convertToSubtask: jest.fn(),
    } as unknown as jest.Mocked<TaskWriteRepository>;

    taskMapper = {
      mapToDto: jest.fn(),
      mapSubtaskSummaries: jest.fn(),
    } as unknown as jest.Mocked<TaskMapper>;

    taskCreateService = {
      createInWorkspaceId: jest.fn(),
    } as unknown as jest.Mocked<TaskCreateService>;

    taskAccessService = {
      getWorkspaceContextById: jest.fn(),
    } as unknown as jest.Mocked<TaskAccessService>;

    validationService = {
      validateObjectId: jest.fn(),
    } as unknown as jest.Mocked<TaskCreationValidationService>;

    taskActivitiesService = {
      recordTaskPermanentlyDeleted: jest.fn(),
      recordTaskUpdated: jest.fn(),
    } as unknown as jest.Mocked<TaskActivitiesService>;

    taskDomainEventPublisher = {
      publishDeleted: jest.fn(),
      publishUpdated: jest.fn(),
    } as unknown as jest.Mocked<TaskDomainEventPublisher>;

    service = new SubtaskService(
      taskReadRepository,
      taskWriteRepository,
      taskMapper,
      taskCreateService,
      taskAccessService,
      validationService,
      taskActivitiesService,
      taskDomainEventPublisher,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSubtask', () => {
    const parentId = new Types.ObjectId().toString();
    const dto = { title: 'Test Subtask' } as CreateTaskDto;

    it('should create a subtask successfully', async () => {
      const parentTask = { _id: parentId, type: 'task', key: 'TEST-1' };
      const createdTask = {
        _id: validObjectId,
        type: 'subtask',
        key: 'TEST-2',
      };

      taskReadRepository.findByIdInWorkspace.mockResolvedValue(
        parentTask as any,
      );
      taskCreateService.createInWorkspaceId.mockResolvedValue(
        createdTask as any,
      );

      const result = await service.createSubtask(
        parentId,
        dto,
        userId,
        workspaceId,
      );

      expect(taskAccessService.getWorkspaceContextById).toHaveBeenCalledWith(
        workspaceId,
        userId,
      );
      expect(taskCreateService.createInWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ type: 'subtask', parentId }),
        userId,
      );
      expect(result).toEqual(createdTask);
    });

    it('should throw BadRequestException if parent is already a subtask', async () => {
      const parentTask = { _id: parentId, type: 'subtask' };
      taskReadRepository.findByIdInWorkspace.mockResolvedValue(
        parentTask as any,
      );

      await expect(
        service.createSubtask(parentId, dto, userId, workspaceId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if parent is an epic', async () => {
      const parentTask = { _id: parentId, type: 'epic' };
      taskReadRepository.findByIdInWorkspace.mockResolvedValue(
        parentTask as any,
      );

      await expect(
        service.createSubtask(parentId, dto, userId, workspaceId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if parent task does not exist', async () => {
      taskReadRepository.findByIdInWorkspace.mockResolvedValue(null);

      await expect(
        service.createSubtask(parentId, dto, userId, workspaceId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSubtasksOfTask', () => {
    const parentId = new Types.ObjectId().toString();

    it('should return mapped subtasks and progress', async () => {
      taskReadRepository.findByIdInWorkspace.mockResolvedValue({
        _id: parentId,
      } as any);
      taskReadRepository.findSubtasksByParentId.mockResolvedValue([
        { _id: validObjectId },
      ] as any);
      taskReadRepository.countSubtasksByParentId.mockResolvedValue(5);
      taskReadRepository.countDoneSubtasksByParentId.mockResolvedValue(2);
      taskMapper.mapSubtaskSummaries.mockReturnValue([
        { id: validObjectId } as any,
      ]);

      const result = await service.getSubtasksOfTask(
        parentId,
        workspaceId,
        userId,
      );

      expect(result.subtasks).toHaveLength(1);
      expect(result.progress).toEqual({ done: 2, total: 5 });
    });
  });

  describe('deleteSubtask', () => {
    const parentId = new Types.ObjectId().toString();
    const subtaskId = new Types.ObjectId().toString();

    it('should soft delete subtask successfully', async () => {
      const subtask = {
        _id: subtaskId,
        type: 'subtask',
        parentId: new Types.ObjectId(parentId),
      };
      taskReadRepository.findByIdInWorkspace.mockResolvedValue(subtask as any);
      taskWriteRepository.softDeleteInWorkspace.mockResolvedValue(
        subtask as any,
      );
      taskMapper.mapToDto.mockReturnValue({ id: subtaskId } as any);

      const result = await service.deleteSubtask(
        parentId,
        subtaskId,
        workspaceId,
        userId,
      );

      expect(taskWriteRepository.softDeleteInWorkspace).toHaveBeenCalledWith(
        subtaskId,
        workspaceId,
        userId,
      );
      expect(
        taskActivitiesService.recordTaskPermanentlyDeleted,
      ).toHaveBeenCalledWith(subtask, userId);
      expect(taskDomainEventPublisher.publishDeleted).toHaveBeenCalledWith(
        subtask,
        userId,
      );
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if task is not a subtask', async () => {
      const subtask = { _id: subtaskId, type: 'task' };
      taskReadRepository.findByIdInWorkspace.mockResolvedValue(subtask as any);

      await expect(
        service.deleteSubtask(parentId, subtaskId, workspaceId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if subtask does not belong to parent', async () => {
      const subtask = {
        _id: subtaskId,
        type: 'subtask',
        parentId: new Types.ObjectId(),
      };
      taskReadRepository.findByIdInWorkspace.mockResolvedValue(subtask as any);

      await expect(
        service.deleteSubtask(parentId, subtaskId, workspaceId, userId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('convertSubtaskToTask', () => {
    const subtaskId = new Types.ObjectId().toString();

    it('should successfully convert subtask to regular task', async () => {
      const subtask = {
        _id: subtaskId,
        type: 'subtask',
        parentId: new Types.ObjectId(),
      };
      const convertedTask = { _id: subtaskId, type: 'task' };

      taskReadRepository.findByIdInWorkspace.mockResolvedValue(subtask as any);
      taskWriteRepository.convertToTask.mockResolvedValue(convertedTask as any);
      taskMapper.mapToDto.mockReturnValue({ id: subtaskId } as any);

      const result = await service.convertSubtaskToTask(
        subtaskId,
        workspaceId,
        userId,
      );

      expect(taskWriteRepository.convertToTask).toHaveBeenCalledWith(
        subtaskId,
        workspaceId,
      );
      expect(taskActivitiesService.recordTaskUpdated).toHaveBeenCalledWith(
        subtask,
        convertedTask,
        userId,
      );
      expect(taskDomainEventPublisher.publishUpdated).toHaveBeenCalledWith(
        subtask,
        convertedTask,
        userId,
      );
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if the task is not a subtask', async () => {
      const subtask = { _id: subtaskId, type: 'task' };
      taskReadRepository.findByIdInWorkspace.mockResolvedValue(subtask as any);

      await expect(
        service.convertSubtaskToTask(subtaskId, workspaceId, userId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('convertTaskToSubtask', () => {
    const taskId = new Types.ObjectId().toString();
    const newParentId = new Types.ObjectId().toString();

    it('should successfully convert task to subtask', async () => {
      const task = { _id: taskId, type: 'task' };
      const parent = {
        _id: new Types.ObjectId(newParentId),
        type: 'task',
        sprintId: new Types.ObjectId(),
      };
      const convertedTask = {
        _id: taskId,
        type: 'subtask',
        parentId: parent._id,
      };

      taskReadRepository.findByIdInWorkspace.mockImplementation(
        (id: string) => {
          if (id === taskId) return Promise.resolve(task as any);
          if (id === newParentId) return Promise.resolve(parent as any);
          return Promise.resolve(null);
        },
      );
      taskReadRepository.countSubtasksByParentId.mockResolvedValue(0);
      taskWriteRepository.convertToSubtask.mockResolvedValue(
        convertedTask as any,
      );
      taskMapper.mapToDto.mockReturnValue({ id: taskId } as any);

      const result = await service.convertTaskToSubtask(
        taskId,
        newParentId,
        workspaceId,
        userId,
      );

      expect(taskWriteRepository.convertToSubtask).toHaveBeenCalledWith(
        taskId,
        workspaceId,
        parent._id,
        parent.sprintId,
      );
      expect(taskActivitiesService.recordTaskUpdated).toHaveBeenCalledWith(
        task,
        convertedTask,
        userId,
      );
      expect(taskDomainEventPublisher.publishUpdated).toHaveBeenCalledWith(
        task,
        convertedTask,
        userId,
      );
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if task is an epic', async () => {
      const task = { _id: taskId, type: 'epic' };
      const parent = { _id: new Types.ObjectId(newParentId), type: 'task' };

      taskReadRepository.findByIdInWorkspace.mockImplementation(
        (id: string) => {
          if (id === taskId) return Promise.resolve(task as any);
          if (id === newParentId) return Promise.resolve(parent as any);
          return Promise.resolve(null);
        },
      );

      await expect(
        service.convertTaskToSubtask(taskId, newParentId, workspaceId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if the task already has subtasks', async () => {
      const task = { _id: taskId, type: 'task' };
      const parent = { _id: new Types.ObjectId(newParentId), type: 'task' };

      taskReadRepository.findByIdInWorkspace.mockImplementation(
        (id: string) => {
          if (id === taskId) return Promise.resolve(task as any);
          if (id === newParentId) return Promise.resolve(parent as any);
          return Promise.resolve(null);
        },
      );
      taskReadRepository.countSubtasksByParentId.mockResolvedValue(2);

      await expect(
        service.convertTaskToSubtask(taskId, newParentId, workspaceId, userId),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
