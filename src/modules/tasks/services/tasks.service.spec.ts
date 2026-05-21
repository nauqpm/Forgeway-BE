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
import { KanbanService } from '../../kanban/services/kanban.service';
import { ScrumService } from '../../scrum/services/scrum.service';
import { UsersService } from '../../users/services/users.service';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { TaskKeyService } from './task-key.service';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;
  let repository: jest.Mocked<TasksRepository>;
  let mapper: jest.Mocked<TaskMapper>;
  let workspacesService: jest.Mocked<WorkspacesService>;
  let kanbanService: jest.Mocked<KanbanService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        TaskKeyService,
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
        {
          provide: KanbanService,
          useValue: {
            findById: jest.fn(),
            findByWorkspace: jest.fn(),
            createDefaultBoard: jest.fn(),
          },
        },
        {
          provide: ScrumService,
          useValue: {
            findByWorkspace: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            getUserById: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    repository = module.get(TasksRepository);
    mapper = module.get(TaskMapper);
    workspacesService = module.get(WorkspacesService);
    kanbanService = module.get(KanbanService);
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
        key: 'TESWS-1',
        title: 'Test Task',
        workspaceId: new Types.ObjectId(workspaceId),
        reporterId: new Types.ObjectId(userId),
      };
      const mockTaskDto = {
        id: mockTask._id.toString(),
        key: 'TESWS-1',
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
          key: 'TESWS-1',
          description: 'Test Description',
        }),
      );
      expect(mapper.mapToDto).toHaveBeenCalledWith(mockTask);
    });

    it('should resolve board and column when creating a kanban task', async () => {
      const userId = new Types.ObjectId().toString();
      const workspaceId = new Types.ObjectId().toString();
      const boardId = new Types.ObjectId().toString();
      const createDto: CreateTaskDto = {
        title: 'Kanban Task',
        status: 'in-progress',
        workspaceId,
      };

      const mockWorkspace = {
        _id: new Types.ObjectId(workspaceId),
        key: 'TESTKANBAN',
        name: 'TestKanban',
        type: 'kanban',
      };
      const mockTask = {
        _id: new Types.ObjectId(),
        key: 'TESKB-1',
        title: 'Kanban Task',
        workspaceId: new Types.ObjectId(workspaceId),
        reporterId: new Types.ObjectId(userId),
        boardId: new Types.ObjectId(boardId),
        columnId: 'inprogress',
      };
      const mockTaskDto = {
        id: mockTask._id.toString(),
        key: 'TESKB-1',
        title: 'Kanban Task',
        boardId,
        columnId: 'inprogress',
      };

      workspacesService.findById.mockResolvedValue(mockWorkspace as any);
      workspacesService.isMember.mockResolvedValue(true);
      kanbanService.findByWorkspace.mockResolvedValue([
        {
          _id: new Types.ObjectId(boardId),
          workspaceId: new Types.ObjectId(workspaceId),
          columns: [
            { id: 'todo', name: 'To Do', order: 0, mappedStatuses: ['todo'] },
            {
              id: 'inprogress',
              name: 'In Progress',
              order: 1,
              mappedStatuses: ['in-progress'],
            },
          ],
        },
      ] as any);
      kanbanService.findById.mockResolvedValue({
        _id: new Types.ObjectId(boardId),
        workspaceId: new Types.ObjectId(workspaceId),
        columns: [],
      } as any);
      repository.countByWorkspace.mockResolvedValue(0);
      repository.create.mockResolvedValue(mockTask as any);
      mapper.mapToDto.mockReturnValue(mockTaskDto as any);

      const result = await service.create(createDto, userId);

      expect(result).toEqual(mockTaskDto);
      expect(kanbanService.findByWorkspace).toHaveBeenCalledWith(workspaceId);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Kanban Task',
          key: 'TESKB-1',
          boardId: new Types.ObjectId(boardId),
          columnId: 'inprogress',
        }),
      );
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
