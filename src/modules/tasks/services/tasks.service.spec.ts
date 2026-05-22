import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
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
            findAll: jest.fn(),
            findByWorkspace: jest.fn(),
            countByWorkspace: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
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
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    repository = module.get(TasksRepository);
    mapper = module.get(TaskMapper);
    keyService = module.get(TaskKeyService);
    validationService = module.get(TaskCreationValidationService);
    normalizerService = module.get(TaskNormalizerService);
    transformerService = module.get(TaskDataTransformerService);
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

  it('deletes a task', async () => {
    const taskId = new Types.ObjectId().toString();
    repository.delete.mockResolvedValue(true);

    await expect(service.delete(taskId)).resolves.toBeUndefined();
  });
});
