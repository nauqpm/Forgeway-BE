import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { CreateTaskDto, UpdateTaskDto } from '../dtos/requests/create-task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TasksRepository } from '../repositories/tasks.repository';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;
  let repository: jest.Mocked<TasksRepository>;
  let mapper: jest.Mocked<TaskMapper>;
  let workspacesService: jest.Mocked<WorkspacesService>;

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
            findBySprint: jest.fn(),
            findByBoard: jest.fn(),
            findByAssignee: jest.fn(),
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
          provide: WorkspacesService,
          useValue: {
            findById: jest.fn(),
            findByUserId: jest.fn(),
            isMember: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    repository = module.get(TasksRepository);
    mapper = module.get(TaskMapper);
    workspacesService = module.get(WorkspacesService);
  });

  describe('create', () => {
    it('should create a task successfully', async () => {
      const userId = new Types.ObjectId().toString();
      const workspaceId = new Types.ObjectId().toString();
      const createDto: CreateTaskDto = {
        title: 'Test Task',
        description: 'Test Description',
      };

      const mockWorkspace = {
        _id: new Types.ObjectId(workspaceId),
        key: 'TEST',
        name: 'Test Workspace',
      };
      const mockTask = {
        _id: new Types.ObjectId(),
        key: 'TEST-1',
        title: 'Test Task',
        workspaceId: new Types.ObjectId(workspaceId),
        reporterId: new Types.ObjectId(userId),
      };
      const mockTaskDto = {
        id: mockTask._id.toString(),
        key: 'TEST-1',
        title: 'Test Task',
      };

      workspacesService.findByUserId.mockResolvedValue([mockWorkspace] as any);
      workspacesService.findById.mockResolvedValue(mockWorkspace as any);
      workspacesService.isMember.mockResolvedValue(true);
      repository.countByWorkspace.mockResolvedValue(0);
      repository.create.mockResolvedValue(mockTask as any);
      mapper.mapToDto.mockReturnValue(mockTaskDto as any);

      const result = await service.create(createDto, userId);

      expect(result).toEqual(mockTaskDto);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Task',
          key: 'TEST-1',
          description: 'Test Description',
        }),
      );
      expect(mapper.mapToDto).toHaveBeenCalledWith(mockTask);
    });

    it('should throw NotFoundException if no workspace found', async () => {
      const userId = new Types.ObjectId().toString();
      const createDto: CreateTaskDto = { title: 'Test Task' };

      workspacesService.findByUserId.mockResolvedValue([]);

      await expect(service.create(createDto, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if workspace id is invalid', async () => {
      const userId = new Types.ObjectId().toString();
      const createDto: CreateTaskDto = {
        title: 'Test Task',
        workspaceId: 'bad-id',
      };

      await expect(service.create(createDto, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException if user not member', async () => {
      const userId = new Types.ObjectId().toString();
      const workspaceId = new Types.ObjectId().toString();
      const createDto: CreateTaskDto = { title: 'Test Task', workspaceId };

      workspacesService.findById.mockResolvedValue({
        _id: new Types.ObjectId(workspaceId),
        key: 'TEST',
      } as any);
      workspacesService.isMember.mockResolvedValue(false);

      await expect(service.create(createDto, userId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findById', () => {
    it('should find task by id', async () => {
      const taskId = new Types.ObjectId().toString();
      const mockTask = {
        _id: new Types.ObjectId(taskId),
        key: 'TEST-1',
        title: 'Test Task',
      };
      const mockDto = { id: taskId, key: 'TEST-1', title: 'Test Task' };

      repository.findById.mockResolvedValue(mockTask as any);
      mapper.mapToDto.mockReturnValue(mockDto as any);

      const result = await service.findById(taskId);

      expect(result).toEqual(mockDto);
    });

    it('should throw NotFoundException if task not found', async () => {
      const taskId = new Types.ObjectId().toString();
      repository.findById.mockResolvedValue(null);

      await expect(service.findById(taskId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update task successfully', async () => {
      const taskId = new Types.ObjectId().toString();
      const updateDto: UpdateTaskDto = { title: 'Updated Task' };
      const mockTask = {
        _id: new Types.ObjectId(taskId),
        key: 'TEST-1',
        title: 'Test Task',
      };
      const updatedTask = { ...mockTask, title: 'Updated Task' };
      const mockDto = { id: taskId, key: 'TEST-1', title: 'Updated Task' };

      repository.findById.mockResolvedValue(mockTask as any);
      repository.update.mockResolvedValue(updatedTask as any);
      mapper.mapToDto.mockReturnValue(mockDto as any);

      const result = await service.update(taskId, updateDto);

      expect(result).toEqual(mockDto);
      expect(repository.update).toHaveBeenCalledWith(
        taskId,
        expect.objectContaining({ title: 'Updated Task' }),
      );
    });

    it('should throw NotFoundException if task not found', async () => {
      const taskId = new Types.ObjectId().toString();
      const updateDto: UpdateTaskDto = { title: 'Updated Task' };

      repository.findById.mockResolvedValue(null);

      await expect(service.update(taskId, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('should delete task successfully', async () => {
      const taskId = new Types.ObjectId().toString();
      const mockTask = { _id: new Types.ObjectId(taskId), key: 'TEST-1' };

      repository.findById.mockResolvedValue(mockTask as any);
      repository.delete.mockResolvedValue(true);

      await expect(service.delete(taskId)).resolves.toBeUndefined();
      expect(repository.delete).toHaveBeenCalledWith(taskId);
    });

    it('should throw NotFoundException if task not found', async () => {
      const taskId = new Types.ObjectId().toString();
      repository.findById.mockResolvedValue(null);

      await expect(service.delete(taskId)).rejects.toThrow(NotFoundException);
    });
  });
});
