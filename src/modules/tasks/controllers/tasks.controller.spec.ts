import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { TasksController } from './tasks.controller';
import { TasksService } from '../services/tasks.service';
import { TaskDetailService } from '../services/task-detail.service';
import { TaskMoveService } from '../services/task-move.service';
import { TaskReorderService } from '../services/task-reorder.service';
import { TaskDependencyService } from '../services/task-dependency.service';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { TokenService } from '../../auth/services/token.service';
import { Types } from 'mongoose';
import { TaskDto } from '../dtos/responses/task.dto';

describe('TasksController', () => {
  let controller: TasksController;
  let tasksService: jest.Mocked<TasksService>;
  let realtimeService: jest.Mocked<RealtimeService>;

  const workspaceId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const makeTaskDto = (overrides: Partial<TaskDto> = {}): TaskDto =>
    ({
      id: new Types.ObjectId().toString(),
      key: 'TESKB-1',
      workspaceId,
      title: 'Test task',
      description: '',
      type: 'task',
      status: 'todo',
      priority: 'medium',
      version: 1,
      reporterId: userId,
      isArchived: false,
      isDeleted: false,
      ...overrides,
    }) as TaskDto;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: {
            findByKeyInWorkspaceId: jest.fn(),
            findByIdInWorkspaceId: jest.fn(),
            findByWorkspaceId: jest.fn(),
            findArchivedByWorkspaceId: jest.fn(),
            findBacklogByWorkspaceId: jest.fn(),
            findActiveSprintBoardByWorkspaceId: jest.fn(),
            findTasksBySprintInWorkspaceId: jest.fn(),
            findCalendarByWorkspaceId: jest.fn(),
            findTimelineHierarchyByWorkspaceId: jest.fn(),
            createInWorkspaceId: jest.fn(),
            updateInWorkspaceId: jest.fn(),
            archiveInWorkspaceId: jest.fn(),
            restoreInWorkspaceId: jest.fn(),
            deletePermanentlyInWorkspaceId: jest.fn(),
          },
        },
        {
          provide: TaskDetailService,
          useValue: {},
        },
        {
          provide: TaskMoveService,
          useValue: {
            moveInWorkspaceId: jest.fn(),
          },
        },
        {
          provide: TaskReorderService,
          useValue: {
            reorderInWorkspaceId: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            logRequest: jest.fn(),
          },
        },
        {
          provide: RealtimeService,
          useValue: {
            emitBoardDelta: jest.fn(),
          },
        },
        {
          provide: TaskDependencyService,
          useValue: {
            findByWorkspace: jest.fn(),
            findByTask: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
          },
        },
        // Dependencies for JwtAuthGuard (class-level guard on controller)
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
            sign: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            findActiveAccessToken: jest.fn(),
            hashToken: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    tasksService = module.get(TasksService);
    realtimeService = module.get(RealtimeService);
  });

  describe('query endpoints do not emit realtime events', () => {
    it('findByTaskKey (GET key/:taskKey)', async () => {
      const task = makeTaskDto();
      tasksService.findByKeyInWorkspaceId.mockResolvedValue(task);

      const req = { ip: '127.0.0.1', method: 'GET', path: '/key/TESKB-1' } as any;

      await controller.findByTaskKey(workspaceId, 'TESKB-1', { userId } as any, req);

      expect(realtimeService.emitBoardDelta).not.toHaveBeenCalled();
    });

    it('findByWorkspaceKey (GET tasks)', async () => {
      tasksService.findByWorkspaceId.mockResolvedValue({
        tasks: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const req = { ip: '127.0.0.1', method: 'GET', path: '/tasks' } as any;

      await controller.findByWorkspaceKey(workspaceId, {} as any, { userId } as any, req);

      expect(realtimeService.emitBoardDelta).not.toHaveBeenCalled();
    });

    it('findArchivedByWorkspaceKey (GET archives)', async () => {
      tasksService.findArchivedByWorkspaceId.mockResolvedValue({
        tasks: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const req = { ip: '127.0.0.1', method: 'GET', path: '/archives' } as any;

      await controller.findArchivedByWorkspaceKey(workspaceId, {} as any, { userId } as any, req);

      expect(realtimeService.emitBoardDelta).not.toHaveBeenCalled();
    });

    it('findById (GET :id)', async () => {
      const task = makeTaskDto();
      tasksService.findByIdInWorkspaceId.mockResolvedValue(task);

      const req = { ip: '127.0.0.1', method: 'GET', path: '/some-id' } as any;

      await controller.findById(workspaceId, task.id, { userId } as any, req);

      expect(realtimeService.emitBoardDelta).not.toHaveBeenCalled();
    });

    it('findBacklogByWorkspaceKey (GET backlog)', async () => {
      tasksService.findBacklogByWorkspaceId.mockResolvedValue([]);

      const req = { ip: '127.0.0.1', method: 'GET', path: '/backlog' } as any;

      await controller.findBacklogByWorkspaceKey(workspaceId, { userId } as any, req);

      expect(realtimeService.emitBoardDelta).not.toHaveBeenCalled();
    });

    it('findActiveSprintBoardByWorkspaceKey (GET active-sprint/tasks)', async () => {
      tasksService.findActiveSprintBoardByWorkspaceId.mockResolvedValue([]);

      const req = { ip: '127.0.0.1', method: 'GET', path: '/active-sprint/tasks' } as any;

      await controller.findActiveSprintBoardByWorkspaceKey(workspaceId, { userId } as any, req);

      expect(realtimeService.emitBoardDelta).not.toHaveBeenCalled();
    });
  });
});
