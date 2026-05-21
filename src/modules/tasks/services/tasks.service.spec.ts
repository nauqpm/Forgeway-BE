import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { KanbanService } from '../../kanban/services/kanban.service';
import { ScrumService } from '../../scrum/services/scrum.service';
import { UsersService } from '../../users/services/users.service';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { CreateTaskDto, UpdateTaskDto } from '../dtos/requests/create-task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TasksRepository } from '../repositories/tasks.repository';
import { TaskKeyService } from './task-key.service';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;
  let repository: jest.Mocked<TasksRepository>;
  let mapper: jest.Mocked<TaskMapper>;
  let workspacesService: jest.Mocked<WorkspacesService>;
  let kanbanService: jest.Mocked<KanbanService>;
  let scrumService: jest.Mocked<ScrumService>;

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
    scrumService = module.get(ScrumService);
  });

  it('creates a kanban task with default board placement', async () => {
    const userId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const boardId = new Types.ObjectId().toString();
    const createDto: CreateTaskDto = { title: 'Kanban Task', workspaceId };
    const task = {
      _id: new Types.ObjectId(),
      key: 'KAN-1',
      title: 'Kanban Task',
    };
    const taskDto = { id: task._id.toString(), key: 'KAN-1' };

    workspacesService.findById.mockResolvedValue({
      _id: new Types.ObjectId(workspaceId),
      key: 'KAN',
      type: 'kanban',
    } as any);
    workspacesService.isMember.mockResolvedValue(true);
    kanbanService.findByWorkspace.mockResolvedValue([
      {
        _id: new Types.ObjectId(boardId),
        workspaceId: new Types.ObjectId(workspaceId),
        columns: [{ id: 'todo', name: 'To Do', order: 0 }],
      },
    ] as any);
    repository.countByWorkspace.mockResolvedValue(0);
    repository.create.mockResolvedValue(task as any);
    mapper.mapToDto.mockReturnValue(taskDto as any);

    const result = await service.create(createDto, userId);

    expect(result).toEqual(taskDto);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Kanban Task',
        boardId: new Types.ObjectId(boardId),
        columnId: 'todo',
        key: 'KAN-1',
      }),
    );
  });

  it('creates a scrum task with sprint reference', async () => {
    const userId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const sprintId = new Types.ObjectId().toString();
    const createDto: CreateTaskDto = {
      title: 'Scrum Task',
      workspaceId,
      sprintId,
    };

    workspacesService.findById.mockResolvedValue({
      _id: new Types.ObjectId(workspaceId),
      key: 'SCR',
      type: 'scrum',
    } as any);
    workspacesService.isMember.mockResolvedValue(true);
    scrumService.findByWorkspace.mockResolvedValue([
      { _id: new Types.ObjectId(sprintId) },
    ] as any);
    repository.countByWorkspace.mockResolvedValue(0);
    repository.create.mockResolvedValue({ key: 'SCR-1' } as any);
    mapper.mapToDto.mockReturnValue({ key: 'SCR-1' } as any);

    await service.create(createDto, userId);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sprintId: new Types.ObjectId(sprintId),
        boardId: undefined,
      }),
    );
  });

  it('rejects task creation when user is not workspace member', async () => {
    const userId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();

    workspacesService.findById.mockResolvedValue({
      _id: new Types.ObjectId(workspaceId),
      type: 'kanban',
    } as any);
    workspacesService.isMember.mockResolvedValue(false);

    await expect(
      service.create({ title: 'Task', workspaceId }, userId),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects invalid workspace id', async () => {
    await expect(
      service.create({ title: 'Task', workspaceId: 'bad-id' }, 'user-id'),
    ).rejects.toThrow(BadRequestException);
  });

  it('finds task by id', async () => {
    const taskId = new Types.ObjectId().toString();
    repository.findById.mockResolvedValue({ _id: taskId } as any);
    mapper.mapToDto.mockReturnValue({ id: taskId } as any);

    await expect(service.findById(taskId)).resolves.toEqual({ id: taskId });
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

    repository.findById.mockResolvedValue({
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
    } as any);
    repository.update.mockResolvedValue({ _id: taskId, title: 'Updated' } as any);
    mapper.mapToDto.mockReturnValue({ id: taskId, title: 'Updated' } as any);

    await expect(service.update(taskId, updateDto)).resolves.toEqual({
      id: taskId,
      title: 'Updated',
    });
  });

  it('deletes a task', async () => {
    const taskId = new Types.ObjectId().toString();
    repository.delete.mockResolvedValue(true);

    await expect(service.delete(taskId)).resolves.toBeUndefined();
  });
});
