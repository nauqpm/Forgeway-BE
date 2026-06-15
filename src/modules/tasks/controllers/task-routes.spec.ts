import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';

describe('TaskControllers - Route Registration (smoke)', () => {
  let app: INestApplication;
  const workspaceId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  const makeTaskDto = (overrides = {}) => ({
    id: new Types.ObjectId().toString(),
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

  beforeEach(async () => {
    const taskDto = makeTaskDto();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        TaskQueryController,
        TaskDetailController,
        TaskCommandController,
        TaskWorkflowController,
        TaskDependencyController,
      ],
      providers: [
        {
          provide: TasksService,
          useValue: {
            findByWorkspaceId: jest.fn().mockResolvedValue({
              tasks: [taskDto],
              total: 1,
              page: 1,
              limit: 20,
            }),
            findArchivedByWorkspaceId: jest
              .fn()
              .mockResolvedValue({ tasks: [], total: 0, page: 1, limit: 20 }),
            findBacklogByWorkspaceId: jest.fn().mockResolvedValue([taskDto]),
            findActiveSprintBoardByWorkspaceId: jest
              .fn()
              .mockResolvedValue([taskDto]),
            findTasksBySprintInWorkspaceId: jest
              .fn()
              .mockResolvedValue([taskDto]),
            findCalendarByWorkspaceId: jest
              .fn()
              .mockResolvedValue({ tasks: [taskDto] }),
            findTimelineHierarchyByWorkspaceId: jest.fn().mockResolvedValue({
              epics: [],
              children: [],
              standalones: [taskDto],
            }),
            createInWorkspaceId: jest.fn().mockResolvedValue(taskDto),
            updateInWorkspaceId: jest.fn().mockResolvedValue(taskDto),
            archiveInWorkspaceId: jest
              .fn()
              .mockResolvedValue({ ...taskDto, isArchived: true }),
            restoreInWorkspaceId: jest.fn().mockResolvedValue(taskDto),
            deletePermanentlyInWorkspaceId: jest
              .fn()
              .mockResolvedValue(taskDto),
          },
        },
        {
          provide: TaskDetailService,
          useValue: {
            getDetailByIdInWorkspaceKey: jest.fn().mockResolvedValue(taskDto),
            getDetailByKeyInWorkspaceKey: jest.fn().mockResolvedValue(taskDto),
          },
        },
        {
          provide: TaskMoveService,
          useValue: {
            moveInWorkspaceId: jest
              .fn()
              .mockResolvedValue({ task: taskDto, auditMetadata: {} }),
          },
        },
        {
          provide: TaskReorderService,
          useValue: {
            reorderInWorkspaceId: jest
              .fn()
              .mockResolvedValue({ task: taskDto, auditMetadata: {} }),
          },
        },
        {
          provide: TaskDependencyService,
          useValue: {
            findByWorkspace: jest.fn().mockResolvedValue([]),
            findByTask: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockResolvedValue({ id: 'dep-1' }),
            delete: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: RealtimeService,
          useValue: { emitBoardDelta: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { logRequest: jest.fn() },
        },
        TaskAuditService,
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
      .overrideGuard(WorkspaceRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();

    // Middleware: inject super_admin user to bypass ScopedRoleGuard (mixin, can't overrideGuard)
    app.use((req: any, _res: any, next: any) => {
      req.user = { userId, role: 'super_admin', email: 'test@test.com' };
      next();
    });

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const basePath = (path: string) => `/workspaces/${workspaceId}/board${path}`;
  const objectId = new Types.ObjectId().toString();

  // ─── Static routes (must NOT be caught by /:id) ─────────────────────────

  it('GET /tasks resolves (not /:id)', () => {
    return request(app.getHttpServer()).get(basePath('/tasks')).expect(200);
  });

  it('GET /archives resolves (not /:id)', () => {
    return request(app.getHttpServer()).get(basePath('/archives')).expect(200);
  });

  it('GET /backlog resolves (not /:id)', () => {
    return request(app.getHttpServer()).get(basePath('/backlog')).expect(200);
  });

  it('GET /active-sprint/tasks resolves (not /:id)', () => {
    return request(app.getHttpServer())
      .get(basePath('/active-sprint/tasks'))
      .expect(200);
  });

  it('GET /calendar resolves (not /:id)', () => {
    return request(app.getHttpServer()).get(basePath('/calendar')).expect(200);
  });

  it('GET /timeline resolves (not /:id)', () => {
    return request(app.getHttpServer()).get(basePath('/timeline')).expect(200);
  });

  it('GET /dependencies resolves (not /:id)', () => {
    return request(app.getHttpServer())
      .get(basePath('/dependencies'))
      .expect(200);
  });

  it('GET /key/:taskKey resolves (not /:id)', () => {
    return request(app.getHttpServer())
      .get(basePath('/key/PROJ-1'))
      .expect(200);
  });

  // ─── Parameterized routes ──────────────────────────────────────────────

  it('GET /:id resolves', () => {
    return request(app.getHttpServer())
      .get(basePath(`/${objectId}`))
      .expect(200);
  });

  it('GET /:taskId/dependencies resolves', () => {
    return request(app.getHttpServer())
      .get(basePath(`/${objectId}/dependencies`))
      .expect(200);
  });

  it('PATCH /:id resolves', () => {
    return request(app.getHttpServer())
      .patch(basePath(`/${objectId}`))
      .send({ title: 'Updated' })
      .expect(200);
  });

  it('PATCH /:id/archive resolves', () => {
    return request(app.getHttpServer())
      .patch(basePath(`/${objectId}/archive`))
      .expect(200);
  });

  it('PATCH /:id/restore resolves', () => {
    return request(app.getHttpServer())
      .patch(basePath(`/${objectId}/restore`))
      .expect(200);
  });

  it('PATCH /:id/move resolves', () => {
    return request(app.getHttpServer())
      .patch(basePath(`/${objectId}/move`))
      .send({ columnId: 'done' })
      .expect(200);
  });

  it('PATCH /:id/reorder resolves', () => {
    return request(app.getHttpServer())
      .patch(basePath(`/${objectId}/reorder`))
      .send({ beforeTaskId: objectId })
      .expect(200);
  });

  // ─── POST and DELETE ───────────────────────────────────────────────────

  it('POST /tasks resolves', () => {
    return request(app.getHttpServer())
      .post(basePath('/tasks'))
      .send({ title: 'New task' })
      .expect(201);
  });

  it('POST /:taskId/dependencies resolves', () => {
    return request(app.getHttpServer())
      .post(basePath(`/${objectId}/dependencies`))
      .send({ toTaskId: objectId })
      .expect(201);
  });

  it('DELETE /:id resolves', () => {
    return request(app.getHttpServer())
      .delete(basePath(`/${objectId}`))
      .send({ confirmText: 'delete' })
      .expect(204);
  });

  it('DELETE /:taskId/dependencies/:depId resolves', () => {
    return request(app.getHttpServer())
      .delete(basePath(`/${objectId}/dependencies/dep-1`))
      .expect(204);
  });
});
