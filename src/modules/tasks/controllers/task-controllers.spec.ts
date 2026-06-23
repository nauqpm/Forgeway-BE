import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { TaskQueryController } from './task-query.controller';
import { TaskDetailController } from './task-detail.controller';
import { TaskCommandController } from './task-command.controller';
import { TaskWorkflowController } from './task-workflow.controller';
import { TaskDependencyController } from './task-dependency.controller';
import { TasksService } from '../services/tasks.service';
import { TaskDetailService } from '../services/task-detail.service';
import { TaskMoveService } from '../services/task-move.service';
import { TaskReorderService } from '../services/task-reorder.service';
import { TaskDependencyService } from '../services/task-dependency.service';
import { TaskAuditService } from '../shared/task-audit.service';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { TokenService } from '../../auth/services/token.service';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('TaskControllers', () => {
  let queryController: TaskQueryController;
  let detailController: TaskDetailController;
  let commandController: TaskCommandController;
  let workflowController: TaskWorkflowController;
  let dependencyController: TaskDependencyController;

  let tasksService: jest.Mocked<TasksService>;
  let taskDetailService: jest.Mocked<TaskDetailService>;
  let taskMoveService: jest.Mocked<TaskMoveService>;
  let taskReorderService: jest.Mocked<TaskReorderService>;
  let taskDependencyService: jest.Mocked<TaskDependencyService>;
  let realtimeService: jest.Mocked<RealtimeService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const workspaceId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const taskId = new Types.ObjectId().toString();
  const sprintId = new Types.ObjectId().toString();

  const makeTaskDto = (overrides = {}) => ({
    id: taskId,
    workspaceId,
    key: 'TESKB-1',
    title: 'Test task',
    description: '',
    type: 'task',
    priority: 'medium',
    status: 'todo',
    rank: 'a0',
    version: 1,
    isArchived: false,
    isDeleted: false,
    reporterId: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const mockReq = { ip: '127.0.0.1', method: 'GET', path: '/test' } as any;
  const mockUser = { userId, role: 'super_admin' } as any;
  const mockFilterDto = {} as any;
  const mockUpdateDto = { title: 'Updated' } as any;
  const mockDeleteDto = { confirmText: 'delete' } as any;

  beforeEach(async () => {
    tasksService = {
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
    } as unknown as jest.Mocked<TasksService>;

    taskDetailService = {
      getDetailByIdInWorkspaceKey: jest.fn(),
      getDetailByKeyInWorkspaceKey: jest.fn(),
    } as unknown as jest.Mocked<TaskDetailService>;

    taskMoveService = {
      moveInWorkspaceId: jest.fn(),
    } as unknown as jest.Mocked<TaskMoveService>;

    taskReorderService = {
      reorderInWorkspaceId: jest.fn(),
    } as unknown as jest.Mocked<TaskReorderService>;

    taskDependencyService = {
      findByWorkspace: jest.fn(),
      findByTask: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<TaskDependencyService>;

    realtimeService = {
      emitBoardDelta: jest.fn(),
    } as unknown as jest.Mocked<RealtimeService>;

    auditLogService = {
      logRequest: jest.fn(),
    } as unknown as jest.Mocked<AuditLogService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        TaskQueryController,
        TaskDetailController,
        TaskCommandController,
        TaskWorkflowController,
        TaskDependencyController,
      ],
      providers: [
        { provide: TasksService, useValue: tasksService },
        { provide: TaskDetailService, useValue: taskDetailService },
        { provide: TaskMoveService, useValue: taskMoveService },
        { provide: TaskReorderService, useValue: taskReorderService },
        { provide: TaskDependencyService, useValue: taskDependencyService },
        { provide: RealtimeService, useValue: realtimeService },
        { provide: AuditLogService, useValue: auditLogService },
        TaskAuditService,
        // Guard dependencies
        {
          provide: JwtService,
          useValue: { verify: jest.fn(), sign: jest.fn() },
        },
        {
          provide: TokenService,
          useValue: { findActiveAccessToken: jest.fn(), hashToken: jest.fn() },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkspaceRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    queryController = module.get(TaskQueryController);
    detailController = module.get(TaskDetailController);
    commandController = module.get(TaskCommandController);
    workflowController = module.get(TaskWorkflowController);
    dependencyController = module.get(TaskDependencyController);
  });

  // ─── TaskQueryController ──────────────────────────────────────────────────

  describe('TaskQueryController', () => {
    it('GET tasks delegates to findByWorkspaceId and logs audit', async () => {
      const result = { tasks: [makeTaskDto()], total: 1, page: 1, limit: 20 };
      tasksService.findByWorkspaceId.mockResolvedValue(result);

      const response = await queryController.findByWorkspaceKey(
        workspaceId,
        mockFilterDto,
        mockUser,
        mockReq,
      );

      expect(tasksService.findByWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        userId,
        mockFilterDto,
      );
      expect(response).toEqual(result);
      expect(auditLogService.logRequest).toHaveBeenCalled();
    });

    it('GET archives delegates to findArchivedByWorkspaceId', async () => {
      tasksService.findArchivedByWorkspaceId.mockResolvedValue({
        tasks: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await queryController.findArchivedByWorkspaceKey(
        workspaceId,
        mockFilterDto,
        mockUser,
        mockReq,
      );

      expect(tasksService.findArchivedByWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        userId,
        mockFilterDto,
      );
    });

    it('GET backlog delegates to findBacklogByWorkspaceId', async () => {
      tasksService.findBacklogByWorkspaceId.mockResolvedValue([]);

      await queryController.findBacklogByWorkspaceKey(
        workspaceId,
        mockUser,
        mockReq,
      );

      expect(tasksService.findBacklogByWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        userId,
      );
    });

    it('GET active-sprint/tasks delegates to findActiveSprintBoardByWorkspaceId', async () => {
      tasksService.findActiveSprintBoardByWorkspaceId.mockResolvedValue([]);

      await queryController.findActiveSprintBoardByWorkspaceKey(
        workspaceId,
        mockUser,
        mockReq,
      );

      expect(
        tasksService.findActiveSprintBoardByWorkspaceId,
      ).toHaveBeenCalledWith(workspaceId, userId);
    });

    it('GET sprints/:sprintId/tasks delegates to findTasksBySprintInWorkspaceId', async () => {
      tasksService.findTasksBySprintInWorkspaceId.mockResolvedValue([]);

      await queryController.findTasksBySprintInWorkspaceKey(
        workspaceId,
        sprintId,
        mockUser,
        mockReq,
      );

      expect(tasksService.findTasksBySprintInWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        sprintId,
        userId,
      );
    });

    it('GET calendar delegates to findCalendarByWorkspaceId', async () => {
      tasksService.findCalendarByWorkspaceId.mockResolvedValue({ tasks: [] });

      await queryController.getCalendarTasks(workspaceId, 2026, 6, mockUser);

      expect(tasksService.findCalendarByWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        2026,
        6,
        userId,
      );
    });

    it('GET timeline delegates to findTimelineHierarchyByWorkspaceId', async () => {
      tasksService.findTimelineHierarchyByWorkspaceId.mockResolvedValue({
        epics: [],
        children: [],
        standalones: [],
      });

      await queryController.getTimelineHierarchy(workspaceId, mockUser);

      expect(
        tasksService.findTimelineHierarchyByWorkspaceId,
      ).toHaveBeenCalledWith(workspaceId, userId);
    });

    it('does NOT emit realtime events on any query endpoint', async () => {
      tasksService.findByWorkspaceId.mockResolvedValue({
        tasks: [],
        total: 0,
        page: 1,
        limit: 20,
      });
      tasksService.findArchivedByWorkspaceId.mockResolvedValue({
        tasks: [],
        total: 0,
        page: 1,
        limit: 20,
      });
      tasksService.findBacklogByWorkspaceId.mockResolvedValue([]);
      tasksService.findActiveSprintBoardByWorkspaceId.mockResolvedValue([]);
      tasksService.findTasksBySprintInWorkspaceId.mockResolvedValue([]);

      await queryController.findByWorkspaceKey(
        workspaceId,
        mockFilterDto,
        mockUser,
        mockReq,
      );
      await queryController.findArchivedByWorkspaceKey(
        workspaceId,
        mockFilterDto,
        mockUser,
        mockReq,
      );
      await queryController.findBacklogByWorkspaceKey(
        workspaceId,
        mockUser,
        mockReq,
      );
      await queryController.findActiveSprintBoardByWorkspaceKey(
        workspaceId,
        mockUser,
        mockReq,
      );
      await queryController.findTasksBySprintInWorkspaceKey(
        workspaceId,
        sprintId,
        mockUser,
        mockReq,
      );

      expect(realtimeService.emitBoardDelta).not.toHaveBeenCalled();
    });

    it('propagates exceptions through audit for list endpoint', async () => {
      const error = new Error('DB error');
      tasksService.findByWorkspaceId.mockRejectedValue(error);

      await expect(
        queryController.findByWorkspaceKey(
          workspaceId,
          mockFilterDto,
          mockUser,
          mockReq,
        ),
      ).rejects.toThrow(error);

      expect(auditLogService.logRequest).toHaveBeenCalledWith(
        mockReq,
        expect.objectContaining({
          severity: 'WARN',
          metadata: expect.objectContaining({ reason: 'DB error' }),
        }),
      );
    });
  });

  // ─── TaskDetailController ─────────────────────────────────────────────────

  describe('TaskDetailController', () => {
    it('GET :id delegates to getDetailByIdInWorkspaceKey', async () => {
      const task = makeTaskDto();
      taskDetailService.getDetailByIdInWorkspaceKey.mockResolvedValue(task);

      const response = await detailController.findById(
        workspaceId,
        taskId,
        mockUser,
        mockReq,
      );

      expect(
        taskDetailService.getDetailByIdInWorkspaceKey,
      ).toHaveBeenCalledWith(workspaceId, taskId, userId);
      expect(response).toEqual(task);
    });

    it('GET key/:taskKey delegates to getDetailByKeyInWorkspaceKey', async () => {
      const task = makeTaskDto();
      taskDetailService.getDetailByKeyInWorkspaceKey.mockResolvedValue(task);

      const response = await detailController.findByTaskKey(
        workspaceId,
        'TESKB-1',
        mockUser,
        mockReq,
      );

      expect(
        taskDetailService.getDetailByKeyInWorkspaceKey,
      ).toHaveBeenCalledWith(workspaceId, 'TESKB-1', userId);
      expect(response).toEqual(task);
    });

    it('does NOT emit realtime events', async () => {
      const task = makeTaskDto();
      taskDetailService.getDetailByIdInWorkspaceKey.mockResolvedValue(task);
      taskDetailService.getDetailByKeyInWorkspaceKey.mockResolvedValue(task);

      await detailController.findById(workspaceId, taskId, mockUser, mockReq);
      await detailController.findByTaskKey(
        workspaceId,
        'TESKB-1',
        mockUser,
        mockReq,
      );

      expect(realtimeService.emitBoardDelta).not.toHaveBeenCalled();
    });

    it('logs audit for detail views', async () => {
      const task = makeTaskDto();
      taskDetailService.getDetailByIdInWorkspaceKey.mockResolvedValue(task);

      await detailController.findById(workspaceId, taskId, mockUser, mockReq);

      expect(auditLogService.logRequest).toHaveBeenCalledWith(
        mockReq,
        expect.objectContaining({ type: 'TASK_VIEWED', severity: 'INFO' }),
      );
    });
  });

  // ─── TaskCommandController ────────────────────────────────────────────────

  describe('TaskCommandController', () => {
    it('POST tasks delegates to createInWorkspaceId with audit and realtime', async () => {
      const task = makeTaskDto();
      tasksService.createInWorkspaceId.mockResolvedValue(task);

      const response = await commandController.create(
        workspaceId,
        { title: 'New' },
        mockUser,
        mockReq,
      );

      expect(tasksService.createInWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        { title: 'New' },
        userId,
      );
      expect(response).toEqual(task);
      expect(auditLogService.logRequest).toHaveBeenCalled();
      expect(realtimeService.emitBoardDelta).toHaveBeenCalledWith(
        workspaceId,
        'task:created',
        { task },
      );
    });

    it('PATCH :id delegates to updateInWorkspaceId with audit', async () => {
      const task = makeTaskDto();
      tasksService.updateInWorkspaceId.mockResolvedValue(task);

      const response = await commandController.update(
        workspaceId,
        taskId,
        mockUpdateDto,
        mockUser,
        mockReq,
      );

      expect(tasksService.updateInWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        taskId,
        mockUpdateDto,
        userId,
      );
      expect(response).toEqual(task);
      expect(auditLogService.logRequest).toHaveBeenCalled();
    });

    it('PATCH :id/archive delegates with audit and realtime deleted', async () => {
      const task = makeTaskDto({ isArchived: true });
      tasksService.archiveInWorkspaceId.mockResolvedValue(task);

      const response = await commandController.archive(
        workspaceId,
        taskId,
        mockUser,
        mockReq,
      );

      expect(tasksService.archiveInWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        taskId,
        userId,
      );
      expect(response).toEqual(task);
      expect(realtimeService.emitBoardDelta).toHaveBeenCalledWith(
        workspaceId,
        'task:deleted',
        {
          taskId: task.id,
        },
      );
    });

    it('PATCH :id/restore delegates with audit and realtime updated', async () => {
      const task = makeTaskDto({ isArchived: false });
      tasksService.restoreInWorkspaceId.mockResolvedValue(task);

      const response = await commandController.restore(
        workspaceId,
        taskId,
        mockUser,
        mockReq,
      );

      expect(tasksService.restoreInWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        taskId,
        userId,
      );
      expect(response).toEqual(task);
      expect(realtimeService.emitBoardDelta).toHaveBeenCalledWith(
        workspaceId,
        'task:updated',
        { task },
      );
    });

    it('DELETE :id delegates with audit and realtime deleted', async () => {
      const task = makeTaskDto({ isArchived: true, isDeleted: true });
      tasksService.deletePermanentlyInWorkspaceId.mockResolvedValue(task);

      await commandController.delete(
        workspaceId,
        taskId,
        mockDeleteDto,
        mockUser,
        mockReq,
      );

      expect(tasksService.deletePermanentlyInWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        taskId,
        userId,
        'delete',
      );
      expect(realtimeService.emitBoardDelta).toHaveBeenCalledWith(
        workspaceId,
        'task:deleted',
        {
          taskId: task.id,
        },
      );
    });
  });

  // ─── TaskWorkflowController ───────────────────────────────────────────────

  describe('TaskWorkflowController', () => {
    it('PATCH :id/move delegates with audit and realtime', async () => {
      const task = makeTaskDto();
      const moveResult = {
        task,
        auditMetadata: { taskId, taskKey: 'TESKB-1' },
      };
      taskMoveService.moveInWorkspaceId.mockResolvedValue(moveResult);

      const response = await workflowController.move(
        workspaceId,
        taskId,
        { columnId: 'done' },
        mockUser,
        mockReq,
      );

      expect(taskMoveService.moveInWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        taskId,
        { columnId: 'done' },
        userId,
      );
      expect(response).toEqual(task);
      expect(auditLogService.logRequest).toHaveBeenCalled();
      expect(realtimeService.emitBoardDelta).toHaveBeenCalledWith(
        workspaceId,
        'task:moved',
        { task },
      );
    });

    it('PATCH :id/reorder delegates with audit and realtime', async () => {
      const task = makeTaskDto();
      const reorderResult = {
        task,
        auditMetadata: { taskId, taskKey: 'TESKB-1', reorder: true },
      };
      taskReorderService.reorderInWorkspaceId.mockResolvedValue(reorderResult);

      const response = await workflowController.reorder(
        workspaceId,
        taskId,
        { beforeTaskId: 'abc' },
        mockUser,
        mockReq,
      );

      expect(taskReorderService.reorderInWorkspaceId).toHaveBeenCalledWith(
        workspaceId,
        taskId,
        { beforeTaskId: 'abc' },
        userId,
      );
      expect(response).toEqual(task);
      expect(auditLogService.logRequest).toHaveBeenCalled();
      expect(realtimeService.emitBoardDelta).toHaveBeenCalledWith(
        workspaceId,
        'task:moved',
        { task },
      );
    });
  });

  // ─── TaskDependencyController ─────────────────────────────────────────────

  describe('TaskDependencyController', () => {
    it('GET dependencies delegates to findByWorkspace', async () => {
      const deps: any[] = [];
      taskDependencyService.findByWorkspace.mockResolvedValue(deps);

      const response =
        await dependencyController.getWorkspaceDependencies(workspaceId);

      expect(taskDependencyService.findByWorkspace).toHaveBeenCalledWith(
        workspaceId,
      );
      expect(response).toEqual(deps);
    });

    it('GET :taskId/dependencies delegates to findByTask', async () => {
      const deps: any[] = [];
      taskDependencyService.findByTask.mockResolvedValue(deps);

      const response = await dependencyController.getTaskDependencies(
        workspaceId,
        taskId,
      );

      expect(taskDependencyService.findByTask).toHaveBeenCalledWith(
        workspaceId,
        taskId,
      );
      expect(response).toEqual(deps);
    });

    it('POST :taskId/dependencies delegates to create', async () => {
      const dep: any = { id: 'dep-1' };
      taskDependencyService.create.mockResolvedValue(dep);

      const response = await dependencyController.createDependency(
        workspaceId,
        taskId,
        {
          toTaskId: 'target-id',
          type: 'blocks',
        },
      );

      expect(taskDependencyService.create).toHaveBeenCalledWith(
        workspaceId,
        taskId,
        'target-id',
        'blocks',
      );
      expect(response).toEqual(dep);
    });

    it('DELETE :taskId/dependencies/:depId delegates to delete', async () => {
      taskDependencyService.delete.mockResolvedValue(undefined);

      await dependencyController.deleteDependency(workspaceId, 'dep-id');

      expect(taskDependencyService.delete).toHaveBeenCalledWith(
        workspaceId,
        'dep-id',
      );
    });

    it('does NOT emit realtime events', async () => {
      taskDependencyService.findByWorkspace.mockResolvedValue([]);
      taskDependencyService.findByTask.mockResolvedValue([]);
      taskDependencyService.create.mockResolvedValue({} as any);
      taskDependencyService.delete.mockResolvedValue(undefined);

      await dependencyController.getWorkspaceDependencies(workspaceId);
      await dependencyController.getTaskDependencies(workspaceId, taskId);
      await dependencyController.createDependency(workspaceId, taskId, {
        toTaskId: 't2',
        type: 'blocks',
      });
      await dependencyController.deleteDependency(workspaceId, 'dep-id');

      expect(realtimeService.emitBoardDelta).not.toHaveBeenCalled();
    });
  });
});
