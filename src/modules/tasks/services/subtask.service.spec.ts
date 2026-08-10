import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
import { WorkflowsService } from '../../workflows/services/workflows.service';

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
  let workflowsService: jest.Mocked<WorkflowsService>;

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
      claimParentForChildCreation: jest.fn(),
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

    workflowsService = {
      getDoneStatusIds: jest.fn().mockResolvedValue(['done']),
    } as unknown as jest.Mocked<WorkflowsService>;

    service = new SubtaskService(
      taskReadRepository,
      taskWriteRepository,
      taskMapper,
      taskCreateService,
      taskAccessService,
      validationService,
      taskActivitiesService,
      taskDomainEventPublisher,
      workflowsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSubtask', () => {
    const parentId = new Types.ObjectId().toString();
    const dto = { title: 'Test Subtask' } as CreateTaskDto;

    it('should create a subtask successfully', async () => {
      const parentTask = {
        _id: parentId,
        type: 'task',
        key: 'TEST-1',
        version: 1,
      };
      const createdTask = {
        _id: validObjectId,
        type: 'subtask',
        key: 'TEST-2',
      };

      taskReadRepository.findByIdInWorkspace.mockResolvedValue(
        parentTask as any,
      );
      // OCC claim succeeds — returns pre-update parent doc
      taskWriteRepository.claimParentForChildCreation.mockResolvedValue(
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
      expect(
        taskWriteRepository.claimParentForChildCreation,
      ).toHaveBeenCalledWith(parentId, workspaceId, 1);
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

    it('should inherit sprintId from parent when parent has a raw ObjectId sprint', async () => {
      const rawSprintId = new Types.ObjectId();
      const parentTask = {
        _id: parentId,
        type: 'task',
        key: 'TEST-1',
        version: 1,
        sprintId: rawSprintId,
      };
      const createdTask = {
        _id: validObjectId,
        type: 'subtask',
        key: 'TEST-2',
      };

      taskReadRepository.findByIdInWorkspace.mockResolvedValue(
        parentTask as any,
      );
      taskWriteRepository.claimParentForChildCreation.mockResolvedValue(
        parentTask as any,
      );
      taskCreateService.createInWorkspaceId.mockResolvedValue(
        createdTask as any,
      );

      await service.createSubtask(parentId, dto, userId, workspaceId);

      expect(taskCreateService.createInWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ sprintId: rawSprintId.toString() }),
        userId,
      );
    });

    it('should extract ObjectId correctly when parent sprintId is a populated document', async () => {
      const sprintObjectId = new Types.ObjectId();
      // Simulate a Mongoose-populated sprint document (has ._id)
      const populatedSprint = {
        _id: sprintObjectId,
        name: 'Sprint 1',
        status: 'active',
      };
      const parentTask = {
        _id: parentId,
        type: 'task',
        key: 'TEST-1',
        version: 2,
        sprintId: populatedSprint,
      };
      const createdTask = {
        _id: validObjectId,
        type: 'subtask',
        key: 'TEST-2',
      };

      taskReadRepository.findByIdInWorkspace.mockResolvedValue(
        parentTask as any,
      );
      taskWriteRepository.claimParentForChildCreation.mockResolvedValue(
        parentTask as any,
      );
      taskCreateService.createInWorkspaceId.mockResolvedValue(
        createdTask as any,
      );

      await service.createSubtask(parentId, dto, userId, workspaceId);

      // Must pass the raw ObjectId string, NOT "[object Object]"
      expect(taskCreateService.createInWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ sprintId: sprintObjectId.toString() }),
        userId,
      );
    });

    it('should pass sprintId as undefined when parent has no sprint', async () => {
      const parentTask = {
        _id: parentId,
        type: 'task',
        key: 'TEST-1',
        version: 1,
        sprintId: null,
      };
      const createdTask = {
        _id: validObjectId,
        type: 'subtask',
        key: 'TEST-2',
      };

      taskReadRepository.findByIdInWorkspace.mockResolvedValue(
        parentTask as any,
      );
      taskWriteRepository.claimParentForChildCreation.mockResolvedValue(
        parentTask as any,
      );
      taskCreateService.createInWorkspaceId.mockResolvedValue(
        createdTask as any,
      );

      await service.createSubtask(parentId, dto, userId, workspaceId);

      expect(taskCreateService.createInWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ sprintId: undefined }),
        userId,
      );
    });

    // RACE CONDITION TESTS
    it('should throw ConflictException when parent was concurrently converted to subtask (OCC miss)', async () => {
      const parentTask = {
        _id: parentId,
        type: 'task',
        key: 'TEST-1',
        version: 1,
      };
      // Simulate concurrent convertToSubtask: parent is now a subtask
      const convertedParent = {
        _id: parentId,
        type: 'subtask',
        key: 'TEST-1',
        version: 2,
      };

      // First read: parent looks like a valid task
      taskReadRepository.findByIdInWorkspace
        .mockResolvedValueOnce(parentTask as any)
        // Re-read after claim fails: parent is now subtask
        .mockResolvedValueOnce(convertedParent as any);
      // OCC claim fails (version mismatch OR type changed)
      taskWriteRepository.claimParentForChildCreation.mockResolvedValue(null);

      await expect(
        service.createSubtask(parentId, dto, userId, workspaceId),
      ).rejects.toThrow(ConflictException);

      // Must NOT have created any child
      expect(taskCreateService.createInWorkspaceId).not.toHaveBeenCalled();
    });

    it('should throw ConflictException with nesting message when re-read shows parent is subtask', async () => {
      const parentTask = { _id: parentId, type: 'task', version: 1 };
      const nowSubtask = { _id: parentId, type: 'subtask', version: 2 };

      taskReadRepository.findByIdInWorkspace
        .mockResolvedValueOnce(parentTask as any)
        .mockResolvedValueOnce(nowSubtask as any);
      taskWriteRepository.claimParentForChildCreation.mockResolvedValue(null);

      await expect(
        service.createSubtask(parentId, dto, userId, workspaceId),
      ).rejects.toThrow('Subtasks cannot have nested subtasks');
    });
  }); // end describe('createSubtask')

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

    // STATUS INVARIANT: shared status space — status phải được giữ nguyên qua convert.
    it.each([
      ['todo'],
      ['inprogress'],
      ['done'],
      ['review'], // custom Kanban column id
      ['testing'], // custom Kanban column id
    ])(
      'should preserve status "%s" when converting subtask to task',
      async originalStatus => {
        const subtask = {
          _id: subtaskId,
          type: 'subtask',
          status: originalStatus,
          parentId: new Types.ObjectId(),
        };
        // convertToTask preserves status: returned doc has same status as subtask
        const convertedTask = {
          _id: subtaskId,
          type: 'task',
          status: originalStatus,
        };

        taskReadRepository.findByIdInWorkspace.mockResolvedValue(
          subtask as any,
        );
        taskWriteRepository.convertToTask.mockResolvedValue(
          convertedTask as any,
        );
        taskMapper.mapToDto.mockReturnValue({
          id: subtaskId,
          status: originalStatus,
        } as any);

        const result = await service.convertSubtaskToTask(
          subtaskId,
          workspaceId,
          userId,
        );

        // Repository is called without any status arg — no status mutation at service layer
        expect(taskWriteRepository.convertToTask).toHaveBeenCalledWith(
          subtaskId,
          workspaceId,
        );
        // mapToDto receives the converted doc with original status intact
        expect(taskMapper.mapToDto).toHaveBeenCalledWith(
          expect.objectContaining({ status: originalStatus }),
        );
        expect(result.status).toBe(originalStatus);
      },
    );
  });

  describe('convertTaskToSubtask', () => {
    const taskId = new Types.ObjectId().toString();
    const newParentId = new Types.ObjectId().toString();

    it('should successfully convert task to subtask', async () => {
      const task = { _id: taskId, type: 'task', version: 3 };
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
        expect.any(Types.ObjectId),
        3, // OCC version token
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

    it('should throw BadRequestException if task is already a subtask', async () => {
      const task = {
        _id: taskId,
        type: 'subtask',
        parentId: new Types.ObjectId(),
      };
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

    // STATUS INVARIANT: shared status space — status phải được giữ nguyên qua convert.
    it.each([
      ['todo'],
      ['inprogress'],
      ['done'],
      ['review'], // custom Kanban column id
      ['testing'], // custom Kanban column id
    ])(
      'should preserve status "%s" when converting task to subtask',
      async originalStatus => {
        const task = {
          _id: taskId,
          type: 'task',
          status: originalStatus,
          version: 1,
        };
        const parent = {
          _id: new Types.ObjectId(newParentId),
          type: 'task',
          sprintId: undefined,
        };
        // convertToSubtask preserves status: returned doc has same status as original task
        const convertedTask = {
          _id: taskId,
          type: 'subtask',
          status: originalStatus,
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
        taskMapper.mapToDto.mockReturnValue({
          id: taskId,
          status: originalStatus,
        } as any);

        const result = await service.convertTaskToSubtask(
          taskId,
          newParentId,
          workspaceId,
          userId,
        );

        // Repository is called with version OCC token — no status mutation at service layer
        expect(taskWriteRepository.convertToSubtask).toHaveBeenCalledWith(
          taskId,
          workspaceId,
          parent._id,
          undefined, // parentPlain.sprintId is undefined
          1, // OCC version token
        );
        // mapToDto receives the converted doc with original status intact
        expect(taskMapper.mapToDto).toHaveBeenCalledWith(
          expect.objectContaining({ status: originalStatus }),
        );
        expect(result.status).toBe(originalStatus);
      },
    );

    // RACE CONDITION TEST
    it('should throw ConflictException when a child is added concurrently (OCC miss on convertToSubtask)', async () => {
      const task = { _id: taskId, type: 'task', version: 2 };
      const parent = { _id: new Types.ObjectId(newParentId), type: 'task' };

      taskReadRepository.findByIdInWorkspace.mockImplementation(
        (id: string) => {
          if (id === taskId) return Promise.resolve(task as any);
          if (id === newParentId) return Promise.resolve(parent as any);
          return Promise.resolve(null);
        },
      );
      taskReadRepository.countSubtasksByParentId
        // Initial check: no children
        .mockResolvedValueOnce(0)
        // Re-read after OCC miss: child was added concurrently
        .mockResolvedValueOnce(1);

      // OCC fails: version changed because createSubtask bumped parent version
      taskWriteRepository.convertToSubtask.mockResolvedValue(null);

      await expect(
        service.convertTaskToSubtask(taskId, newParentId, workspaceId, userId),
      ).rejects.toThrow(ConflictException);

      // Must NOT have published any event
      expect(taskDomainEventPublisher.publishUpdated).not.toHaveBeenCalled();
    });

    it('maintains the same status after converting to subtask (status invariant)', async () => {
      const currentTask = {
        _id: validObjectId,
        key: 'TEST-1',
        type: 'task',
        version: 1,
        status: 'custom_testing_status', // Custom status space
        toObject: function () {
          return this;
        },
      };

      const convertedTask = {
        _id: validObjectId,
        key: 'TEST-1',
        type: 'subtask',
        version: 2,
        parentId: validObjectId,
        status: 'custom_testing_status', // Expected to remain unchanged
      };

      const newParentId = new Types.ObjectId().toString();

      taskReadRepository.findByIdInWorkspace
        .mockResolvedValueOnce(currentTask as any) // target task
        .mockResolvedValueOnce({
          _id: newParentId,
          type: 'task',
          version: 1,
        } as any); // new parent

      taskWriteRepository.claimParentForChildCreation.mockResolvedValueOnce({
        _id: newParentId,
      } as any);
      taskWriteRepository.convertToSubtask.mockResolvedValueOnce(
        convertedTask as any,
      );
      taskMapper.mapToDto.mockReturnValueOnce(convertedTask as any);

      const result = await service.convertTaskToSubtask(
        validObjectId,
        newParentId,
        workspaceId,
        userId,
      );

      expect(result.status).toBe('custom_testing_status');
      expect(taskWriteRepository.convertToSubtask).toHaveBeenCalledWith(
        validObjectId,
        workspaceId,
        newParentId,
        undefined,
        1,
      );
    });

    it('successfully extracts raw sprintId when parent sprint is populated', async () => {
      const parentWithPopulatedSprint = {
        _id: validObjectId,
        key: 'TEST-1',
        type: 'task',
        version: 1,
        // Giả lập populated sprint document
        sprintId: {
          _id: new Types.ObjectId(),
          name: 'Sprint 1',
          toHexString: function () {
            return this._id.toHexString();
          },
        },
        toObject: () => parentWithPopulatedSprint,
      };

      taskReadRepository.findByIdInWorkspace.mockResolvedValueOnce(
        parentWithPopulatedSprint as any,
      );
      taskWriteRepository.claimParentForChildCreation.mockResolvedValueOnce({
        _id: validObjectId,
      } as any);
      const sprintIdStr = (
        parentWithPopulatedSprint.sprintId as any
      )._id.toHexString();
      taskCreateService.createInWorkspaceId.mockResolvedValueOnce({
        id: new Types.ObjectId().toString(),
        key: 'TEST-2',
        sprintId: sprintIdStr,
      } as any);

      const result = await service.createSubtask(
        validObjectId,
        { title: 'Subtask 1' },
        userId,
        workspaceId,
      );

      expect(taskCreateService.createInWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          sprintId: sprintIdStr,
        }),
        userId,
      );
      expect(result).toBeDefined();
    });

    it('extracts raw sprintId when converting task to subtask under parent with populated sprint', async () => {
      const task = { _id: taskId, type: 'task', version: 2 };
      const sprintObjectId = new Types.ObjectId();
      const parent = {
        _id: new Types.ObjectId(newParentId),
        type: 'task',
        version: 1,
        sprintId: {
          _id: sprintObjectId,
          name: 'Sprint 1',
          toObject: () => parent.sprintId,
        },
        toObject: () => parent,
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

      await service.convertTaskToSubtask(
        taskId,
        newParentId,
        workspaceId,
        userId,
      );

      expect(taskWriteRepository.convertToSubtask).toHaveBeenCalledWith(
        taskId,
        workspaceId,
        parent._id,
        expect.any(Types.ObjectId),
        2,
      );
    });
  });
});
