import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ScrumService } from '../../scrum/services/scrum.service';
import { CreateTaskDto, UpdateTaskDto } from '../dtos/requests/create-task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TasksRepository } from '../repositories/tasks.repository';
import { TaskCreationValidationService } from './task-creation-validation.service';
import { TaskDataTransformerService } from './task-data-transformer.service';
import { TaskKeyService } from './task-key.service';
import { TaskNormalizerService } from './task-normalizer.service';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;
  let repository: jest.Mocked<TasksRepository>;
  let mapper: jest.Mocked<TaskMapper>;
  let validationService: jest.Mocked<TaskCreationValidationService>;
  let normalizerService: jest.Mocked<TaskNormalizerService>;
  let transformerService: jest.Mocked<TaskDataTransformerService>;
  let keyService: jest.Mocked<TaskKeyService>;
  let scrumService: jest.Mocked<ScrumService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: TasksRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findByKey: jest.fn(),
            findByIdInWorkspace: jest.fn(),
            findByKeyInWorkspace: jest.fn(),
            findByWorkspaceAndKey: jest.fn(),
            findAll: jest.fn(),
            findByWorkspace: jest.fn(),
            findArchivedByWorkspace: jest.fn(),
            findBacklogByWorkspace: jest.fn(),
            findBySprintInWorkspace: jest.fn(),
            countByWorkspace: jest.fn(),
            update: jest.fn(),
            updateInWorkspace: jest.fn(),
            archive: jest.fn(),
            archiveInWorkspace: jest.fn(),
            restore: jest.fn(),
            restoreInWorkspace: jest.fn(),
            softDelete: jest.fn(),
            softDeleteInWorkspace: jest.fn(),
          },
        },
        {
          provide: TaskMapper,
          useValue: {
            mapToDto: jest.fn(),
            mapToDtos: jest.fn(),
          },
        },
        {
          provide: TaskKeyService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: TaskCreationValidationService,
          useValue: {
            validateCreateRequest: jest.fn(),
            validateUpdateRequest: jest.fn(),
            validateWorkspaceMember: jest.fn(),
            validateObjectId: jest.fn(),
            getWorkspaceByKey: jest.fn(),
            getWorkspaceById: jest.fn(),
          },
        },
        {
          provide: TaskNormalizerService,
          useValue: {
            normalizeForWorkspaceType: jest.fn(),
            normalizeUpdateForWorkspaceType: jest.fn(),
          },
        },
        {
          provide: TaskDataTransformerService,
          useValue: {
            transformCreateInput: jest.fn(),
            transformUpdateInput: jest.fn(),
          },
        },
        {
          provide: ScrumService,
          useValue: {
            getActiveSprint: jest.fn(),
            findByIdInWorkspace: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    repository = module.get(TasksRepository);
    mapper = module.get(TaskMapper);
    keyService = module.get(TaskKeyService);
    validationService = module.get(TaskCreationValidationService);
    normalizerService = module.get(TaskNormalizerService);
    transformerService = module.get(TaskDataTransformerService);
    scrumService = module.get(ScrumService);
  });

  it('creates a task by delegating validation, normalization and transformation', async () => {
    const userId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const createDto: CreateTaskDto = { title: 'Task', workspaceId };
    const workspace = {
      _id: new Types.ObjectId(workspaceId),
      key: 'TESKB',
      type: 'kanban',
    };
    const normalizedDto = { ...createDto, columnId: 'todo' };
    const taskData = {
      title: 'Task',
      key: 'TESKB-1',
      workspaceId: new Types.ObjectId(workspaceId),
    };
    const task = { _id: new Types.ObjectId(), key: 'TESKB-1' };
    const taskDto = { id: task._id.toString(), key: 'TESKB-1' };

    validationService.validateCreateRequest.mockResolvedValue(workspace as any);
    normalizerService.normalizeForWorkspaceType.mockResolvedValue(normalizedDto);
    repository.countByWorkspace.mockResolvedValue(0);
    keyService.create.mockReturnValue('TESKB-1');
    transformerService.transformCreateInput.mockReturnValue(taskData as any);
    repository.create.mockResolvedValue(task as any);
    mapper.mapToDto.mockReturnValue(taskDto as any);

    const result = await service.create(createDto, userId);

    expect(result).toEqual(taskDto);
    expect(validationService.validateCreateRequest).toHaveBeenCalledWith(
      createDto,
      workspaceId,
      userId,
    );
    expect(normalizerService.normalizeForWorkspaceType).toHaveBeenCalledWith(
      createDto,
      workspace,
    );
    expect(transformerService.transformCreateInput).toHaveBeenCalledWith(
      normalizedDto,
      workspaceId,
      userId,
      'TESKB-1',
    );
    expect(repository.create).toHaveBeenCalledWith(taskData);
  });

  it('rejects create when workspaceId is missing', async () => {
    await expect(service.create({ title: 'Task' }, 'user-id')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates a task from workspace key', async () => {
    const workspaceId = new Types.ObjectId().toString();
    const workspace = { _id: new Types.ObjectId(workspaceId), key: 'TESKB' };
    const createSpy = jest
      .spyOn(service, 'create')
      .mockResolvedValue({ key: 'TESKB-1' } as any);

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);

    await service.createInWorkspaceKey('TESKB', { title: 'Task' }, 'user-id');

    expect(createSpy).toHaveBeenCalledWith(
      { title: 'Task', workspaceId },
      'user-id',
    );
  });

  it('finds all tasks and maps pagination response', async () => {
    const workspaceId = new Types.ObjectId().toString();
    const tasks = [{ key: 'TESKB-1' }];

    repository.findAll.mockResolvedValue({
      tasks: tasks as any,
      total: 1,
      page: 1,
      limit: 20,
    });
    mapper.mapToDtos.mockReturnValue([{ key: 'TESKB-1' }] as any);

    const result = await service.findAll({ workspaceId }, 'user-id');

    expect(validationService.validateWorkspaceMember).toHaveBeenCalledWith(
      workspaceId,
      'user-id',
    );
    expect(result).toEqual({
      tasks: [{ key: 'TESKB-1' }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('finds workspace tasks by key with board filters', async () => {
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const workspace = { _id: new Types.ObjectId(workspaceId), key: 'TESKB' };
    const tasks = [{ key: 'TESKB-1', status: 'todo' }];
    const filters = {
      status: ['todo', 'inprogress', 'testing'],
      columnId: 'todo',
      search: 'login',
      backlog: false,
      workspaceId: new Types.ObjectId().toString(),
    };

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    repository.findAll.mockResolvedValue({
      tasks: tasks as any,
      total: 1,
      page: 1,
      limit: 20,
    });
    mapper.mapToDtos.mockReturnValue([{ key: 'TESKB-1', status: 'todo' }] as any);

    const result = await service.findByWorkspaceKey('TESKB', userId, filters as any);

    expect(validationService.validateWorkspaceMember).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
    expect(repository.findAll).toHaveBeenCalledWith({
      ...filters,
      workspaceId,
    });
    expect(result).toEqual([{ key: 'TESKB-1', status: 'todo' }]);
  });

  it('finds Scrum backlog tasks by workspace key', async () => {
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const workspace = {
      _id: new Types.ObjectId(workspaceId),
      key: 'SCRUM',
      type: 'scrum',
    };
    const tasks = [{ key: 'SCRUM-1', sprintId: null }];

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    repository.findBacklogByWorkspace.mockResolvedValue(tasks as any);
    mapper.mapToDtos.mockReturnValue([{ key: 'SCRUM-1' }] as any);

    const result = await service.findBacklogByWorkspaceKey('SCRUM', userId);

    expect(validationService.validateWorkspaceMember).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
    expect(repository.findBacklogByWorkspace).toHaveBeenCalledWith(workspaceId);
    expect(result).toEqual([{ key: 'SCRUM-1' }]);
  });

  it('finds tasks for the active Scrum sprint board', async () => {
    const workspaceId = new Types.ObjectId().toString();
    const sprintId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const workspace = {
      _id: new Types.ObjectId(workspaceId),
      key: 'SCRUM',
      type: 'scrum',
    };
    const tasks = [{ key: 'SCRUM-2', sprintId }];

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    scrumService.getActiveSprint.mockResolvedValue({
      _id: new Types.ObjectId(sprintId),
      status: 'active',
    } as any);
    repository.findBySprintInWorkspace.mockResolvedValue(tasks as any);
    mapper.mapToDtos.mockReturnValue([{ key: 'SCRUM-2' }] as any);

    const result = await service.findActiveSprintBoardByWorkspaceKey('SCRUM', userId);

    expect(scrumService.getActiveSprint).toHaveBeenCalledWith(workspaceId);
    expect(repository.findBySprintInWorkspace).toHaveBeenCalledWith(
      workspaceId,
      sprintId,
    );
    expect(result).toEqual([{ key: 'SCRUM-2' }]);
  });

  it('finds tasks by sprint in workspace key', async () => {
    const workspaceId = new Types.ObjectId().toString();
    const sprintId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const workspace = {
      _id: new Types.ObjectId(workspaceId),
      key: 'SCRUM',
      type: 'scrum',
    };

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    scrumService.findByIdInWorkspace.mockResolvedValue({
      _id: new Types.ObjectId(sprintId),
      status: 'planning',
    } as any);
    repository.findBySprintInWorkspace.mockResolvedValue([{ key: 'SCRUM-3' }] as any);
    mapper.mapToDtos.mockReturnValue([{ key: 'SCRUM-3' }] as any);

    const result = await service.findTasksBySprintInWorkspaceKey(
      'SCRUM',
      sprintId,
      userId,
    );

    expect(scrumService.findByIdInWorkspace).toHaveBeenCalledWith(
      workspaceId,
      sprintId,
    );
    expect(repository.findBySprintInWorkspace).toHaveBeenCalledWith(
      workspaceId,
      sprintId,
    );
    expect(result).toEqual([{ key: 'SCRUM-3' }]);
  });

  it('finds task by id', async () => {
    const taskId = new Types.ObjectId().toString();
    repository.findById.mockResolvedValue({ _id: taskId } as any);
    mapper.mapToDto.mockReturnValue({ id: taskId } as any);

    await expect(service.findById(taskId)).resolves.toEqual({ id: taskId });
    expect(validationService.validateObjectId).toHaveBeenCalledWith(
      taskId,
      'Task',
    );
  });

  it('finds a task key only inside the resolved workspace', async () => {
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const workspace = { _id: new Types.ObjectId(workspaceId), key: 'TESKB' };
    const task = {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(workspaceId),
      key: 'TESKB-1',
    };
    const taskDto = { id: task._id.toString(), workspaceId, key: 'TESKB-1' };

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    repository.findByWorkspaceAndKey.mockResolvedValue(task as any);
    mapper.mapToDto.mockReturnValue(taskDto as any);

    await expect(
      service.findByKeyInWorkspace('TESKB', 'TESKB-1', userId),
    ).resolves.toEqual(taskDto);
    expect(validationService.validateWorkspaceMember).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
    expect(repository.findByWorkspaceAndKey).toHaveBeenCalledWith(
      workspaceId,
      'TESKB-1',
    );
  });

  it('throws when task is not found', async () => {
    const taskId = new Types.ObjectId().toString();
    repository.findById.mockResolvedValue(null);

    await expect(service.findById(taskId)).rejects.toThrow(NotFoundException);
  });

  it('updates a task', async () => {
    const taskId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const updateDto: UpdateTaskDto = { title: 'Updated' };
    const updateData = { title: 'Updated' };
    const existingTask = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
    };

    repository.findById.mockResolvedValue(existingTask as any);
    normalizerService.normalizeUpdateForWorkspaceType.mockResolvedValue(
      updateDto,
    );
    transformerService.transformUpdateInput.mockReturnValue(updateData as any);
    repository.update.mockResolvedValue({ _id: taskId, title: 'Updated' } as any);
    mapper.mapToDto.mockReturnValue({ id: taskId, title: 'Updated' } as any);

    await expect(service.update(taskId, updateDto)).resolves.toEqual({
      id: taskId,
      title: 'Updated',
    });
    expect(validationService.validateUpdateRequest).toHaveBeenCalledWith(
      updateDto,
      workspaceId,
    );
    expect(normalizerService.normalizeUpdateForWorkspaceType).toHaveBeenCalledWith(
      updateDto,
      existingTask,
    );
    expect(repository.update).toHaveBeenCalledWith(taskId, updateData);
  });

  it('finds a task by id scoped to workspace key', async () => {
    const taskId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const workspace = { _id: new Types.ObjectId(workspaceId), key: 'TESKB' };
    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
    };
    const taskDto = { id: taskId, workspaceId };

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    repository.findByIdInWorkspace.mockResolvedValue(task as any);
    mapper.mapToDto.mockReturnValue(taskDto as any);

    await expect(
      service.findByIdInWorkspaceKey('TESKB', taskId, userId),
    ).resolves.toEqual(taskDto);
    expect(validationService.validateWorkspaceMember).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
    expect(repository.findByIdInWorkspace).toHaveBeenCalledWith(
      taskId,
      workspaceId,
      {},
    );
  });

  it('returns not found when scoped task lookup misses workspace boundary', async () => {
    const taskId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const workspace = { _id: new Types.ObjectId(workspaceId), key: 'TESKB' };

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    repository.findByIdInWorkspace.mockResolvedValue(null);

    await expect(
      service.findByIdInWorkspaceKey('TESKB', taskId, userId),
    ).rejects.toThrow(NotFoundException);
    expect(repository.findByIdInWorkspace).toHaveBeenCalledWith(
      taskId,
      workspaceId,
      {},
    );
  });

  it('updates a task scoped to workspace key', async () => {
    const taskId = new Types.ObjectId().toString();
    const taskKey = 'TESKB-1';
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const updateDto: UpdateTaskDto = { title: 'Updated' };
    const updateData = { title: 'Updated' };
    const workspace = { _id: new Types.ObjectId(workspaceId), key: 'TESKB' };
    const existingTask = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      key: taskKey,
      isArchived: false,
    };
    const updatedTask = { ...existingTask, title: 'Updated' };
    const taskDto = { id: taskId, key: taskKey, title: 'Updated' };

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    repository.findByWorkspaceAndKey.mockResolvedValue(existingTask as any);
    normalizerService.normalizeUpdateForWorkspaceType.mockResolvedValue(
      updateDto,
    );
    transformerService.transformUpdateInput.mockReturnValue(updateData as any);
    repository.updateInWorkspace.mockResolvedValue(updatedTask as any);
    mapper.mapToDto.mockReturnValue(taskDto as any);

    await expect(
      service.updateInWorkspaceKey('TESKB', taskKey, updateDto, userId),
    ).resolves.toEqual(taskDto);
    expect(validationService.validateWorkspaceMember).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
    expect(validationService.validateUpdateRequest).toHaveBeenCalledWith(
      updateDto,
      workspaceId,
    );
    expect(repository.findByWorkspaceAndKey).toHaveBeenCalledWith(
      workspaceId,
      taskKey,
      { includeArchived: true },
    );
    expect(repository.updateInWorkspace).toHaveBeenCalledWith(
      taskId,
      workspaceId,
      updateData,
    );
  });

  it('rejects sprint reassignment when task belongs to a completed sprint', async () => {
    const taskId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const currentSprintId = new Types.ObjectId().toString();
    const nextSprintId = new Types.ObjectId().toString();
    const workspace = { _id: new Types.ObjectId(workspaceId), key: 'SCRUM' };
    const existingTask = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      sprintId: new Types.ObjectId(currentSprintId),
      isArchived: false,
    };

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    repository.findByIdInWorkspace.mockResolvedValue(existingTask as any);
    scrumService.findByIdInWorkspace.mockResolvedValue({
      _id: new Types.ObjectId(currentSprintId),
      status: 'completed',
    } as any);

    await expect(
      service.updateInWorkspaceKey(
        'SCRUM',
        taskId,
        { sprintId: nextSprintId },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repository.updateInWorkspace).not.toHaveBeenCalled();
  });

  it('archives a task by workspace key', async () => {
    const taskId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const workspace = { _id: new Types.ObjectId(workspaceId), key: 'TESKB' };
    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false,
    };
    const archivedTask = { ...task, isArchived: true };
    const taskDto = { id: taskId, isArchived: true };

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    repository.findByIdInWorkspace.mockResolvedValue(task as any);
    repository.archiveInWorkspace.mockResolvedValue(archivedTask as any);
    mapper.mapToDto.mockReturnValue(taskDto as any);

    await expect(
      service.archiveInWorkspaceKey('TESKB', taskId, userId),
    ).resolves.toEqual(taskDto);
    expect(repository.archiveInWorkspace).toHaveBeenCalledWith(
      taskId,
      workspaceId,
      userId,
    );
  });

  it('archives a task key only inside the resolved workspace', async () => {
    const taskId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const workspace = { _id: new Types.ObjectId(workspaceId), key: 'TESKB' };
    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      key: 'TESKB-1',
      isArchived: false,
    };
    const archivedTask = { ...task, isArchived: true };
    const taskDto = { id: taskId, key: 'TESKB-1', isArchived: true };

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    repository.findByWorkspaceAndKey.mockResolvedValue(task as any);
    repository.archiveInWorkspace.mockResolvedValue(archivedTask as any);
    mapper.mapToDto.mockReturnValue(taskDto as any);

    await expect(
      service.archiveTaskKeyInWorkspace('TESKB', 'TESKB-1', userId),
    ).resolves.toEqual(taskDto);
    expect(repository.archiveInWorkspace).toHaveBeenCalledWith(
      taskId,
      workspaceId,
      userId,
    );
  });

  it('restores an archived task by workspace key', async () => {
    const taskId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const workspace = { _id: new Types.ObjectId(workspaceId), key: 'TESKB' };
    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: true,
    };
    const restoredTask = { ...task, isArchived: false };
    const taskDto = { id: taskId, isArchived: false };

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    repository.findByIdInWorkspace.mockResolvedValue(task as any);
    repository.restoreInWorkspace.mockResolvedValue(restoredTask as any);
    mapper.mapToDto.mockReturnValue(taskDto as any);

    await expect(
      service.restoreInWorkspaceKey('TESKB', taskId, userId),
    ).resolves.toEqual(taskDto);
    expect(repository.restoreInWorkspace).toHaveBeenCalledWith(
      taskId,
      workspaceId,
    );
  });

  it('restores a task key only inside the resolved workspace', async () => {
    const taskId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const workspace = { _id: new Types.ObjectId(workspaceId), key: 'TESKB' };
    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      key: 'TESKB-1',
      isArchived: true,
    };
    const restoredTask = { ...task, isArchived: false };
    const taskDto = { id: taskId, key: 'TESKB-1', isArchived: false };

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    repository.findByWorkspaceAndKey.mockResolvedValue(task as any);
    repository.restoreInWorkspace.mockResolvedValue(restoredTask as any);
    mapper.mapToDto.mockReturnValue(taskDto as any);

    await expect(
      service.restoreTaskKeyInWorkspace('TESKB', 'TESKB-1', userId),
    ).resolves.toEqual(taskDto);
    expect(repository.restoreInWorkspace).toHaveBeenCalledWith(
      taskId,
      workspaceId,
    );
  });

  it('soft deletes a task permanently when confirmation is valid', async () => {
    const taskId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const workspace = { _id: new Types.ObjectId(workspaceId), key: 'TESKB' };
    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false,
    };
    const deletedTask = { ...task, isArchived: true, isDeleted: true };
    const taskDto = { id: taskId, isDeleted: true };

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    repository.findByIdInWorkspace.mockResolvedValue(task as any);
    repository.softDeleteInWorkspace.mockResolvedValue(deletedTask as any);
    mapper.mapToDto.mockReturnValue(taskDto as any);

    await expect(
      service.deletePermanentlyInWorkspaceKey('TESKB', taskId, userId, 'delete'),
    ).resolves.toEqual(taskDto);
    expect(repository.softDeleteInWorkspace).toHaveBeenCalledWith(
      taskId,
      workspaceId,
      userId,
    );
  });

  it('soft deletes a task key only inside the resolved workspace', async () => {
    const taskId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const workspace = { _id: new Types.ObjectId(workspaceId), key: 'TESKB' };
    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      key: 'TESKB-1',
      isArchived: false,
    };
    const deletedTask = { ...task, isArchived: true, isDeleted: true };
    const taskDto = { id: taskId, key: 'TESKB-1', isDeleted: true };

    validationService.getWorkspaceByKey.mockResolvedValue(workspace as any);
    repository.findByWorkspaceAndKey.mockResolvedValue(task as any);
    repository.softDeleteInWorkspace.mockResolvedValue(deletedTask as any);
    mapper.mapToDto.mockReturnValue(taskDto as any);

    await expect(
      service.deleteTaskKeyPermanentlyInWorkspace('TESKB', 'TESKB-1', userId, 'delete'),
    ).resolves.toEqual(taskDto);
    expect(repository.softDeleteInWorkspace).toHaveBeenCalledWith(
      taskId,
      workspaceId,
      userId,
    );
  });

  it('rejects permanent delete when confirmation is invalid', async () => {
    await expect(
      service.deletePermanentlyInWorkspaceKey('TESKB', 'task-id', 'user-id', 'wrong'),
    ).rejects.toThrow(BadRequestException);
  });
});
