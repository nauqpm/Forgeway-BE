import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { CreateTaskDto, UpdateTaskDto } from '../dtos/requests/create-task.dto';
import { TasksService } from './tasks.service';
import { TaskCreateService } from './task-create.service';
import { TaskQueryService } from './task-query.service';
import { TaskUpdateService } from './task-update.service';
import { TaskLifecycleService } from './task-lifecycle.service';

describe('TasksService', () => {
  let service: TasksService;
  let taskCreateService: jest.Mocked<TaskCreateService>;
  let taskQueryService: jest.Mocked<TaskQueryService>;
  let taskUpdateService: jest.Mocked<TaskUpdateService>;
  let taskLifecycleService: jest.Mocked<TaskLifecycleService>;

  const userId = new Types.ObjectId().toString();
  const workspaceId = new Types.ObjectId().toString();
  const taskId = new Types.ObjectId().toString();
  const makeTaskDto = (overrides = {}) => ({
    id: taskId,
    workspaceId,
    key: 'TESKB-1',
    title: 'Test Task',
    description: '',
    type: 'task',
    priority: 'medium',
    status: 'todo',
    rank: 'a0',
    version: 1,
    isArchived: false,
    isDeleted: false,
    reporterId: workspaceId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const taskDto = makeTaskDto();
  const taskListDto = { tasks: [taskDto], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    taskCreateService = {
      create: jest.fn(),
      createInWorkspaceKey: jest.fn(),
      createInWorkspaceId: jest.fn(),
    } as unknown as jest.Mocked<TaskCreateService>;

    taskQueryService = {
      findAll: jest.fn(),
      findByWorkspace: jest.fn(),
      findByWorkspaceKey: jest.fn(),
      findByWorkspaceId: jest.fn(),
      findArchivedByWorkspaceKey: jest.fn(),
      findArchivedByWorkspaceId: jest.fn(),
      findBacklogByWorkspaceKey: jest.fn(),
      findBacklogByWorkspaceId: jest.fn(),
      findActiveSprintBoardByWorkspaceKey: jest.fn(),
      findActiveSprintBoardByWorkspaceId: jest.fn(),
      findTasksBySprintInWorkspaceKey: jest.fn(),
      findTasksBySprintInWorkspaceId: jest.fn(),
      findById: jest.fn(),
      findByIdInWorkspaceKey: jest.fn(),
      findByIdInWorkspaceId: jest.fn(),
      findByIdForAccessCheck: jest.fn(),
      findByKey: jest.fn(),
      findByKeyInWorkspaceKey: jest.fn(),
      findByKeyInWorkspace: jest.fn(),
      findByKeyInWorkspaceId: jest.fn(),
      findCalendarByWorkspaceId: jest.fn(),
      findTimelineHierarchyByWorkspaceId: jest.fn(),
    } as unknown as jest.Mocked<TaskQueryService>;

    taskUpdateService = {
      update: jest.fn(),
      updateInWorkspaceKey: jest.fn(),
      updateInWorkspaceId: jest.fn(),
    } as unknown as jest.Mocked<TaskUpdateService>;

    taskLifecycleService = {
      archiveInWorkspaceKey: jest.fn(),
      archiveTaskKeyInWorkspace: jest.fn(),
      archiveInWorkspaceId: jest.fn(),
      restoreInWorkspaceKey: jest.fn(),
      restoreTaskKeyInWorkspace: jest.fn(),
      restoreInWorkspaceId: jest.fn(),
      deletePermanentlyInWorkspaceKey: jest.fn(),
      deleteTaskKeyPermanentlyInWorkspace: jest.fn(),
      deletePermanentlyInWorkspaceId: jest.fn(),
    } as unknown as jest.Mocked<TaskLifecycleService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: TaskCreateService, useValue: taskCreateService },
        { provide: TaskQueryService, useValue: taskQueryService },
        { provide: TaskUpdateService, useValue: taskUpdateService },
        { provide: TaskLifecycleService, useValue: taskLifecycleService },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  // ─── Create delegation ──────────────────────────────────────────────────

  it('delegates create to TaskCreateService', async () => {
    const dto: CreateTaskDto = { title: 'Task', workspaceId };
    taskCreateService.create.mockResolvedValue(taskDto);
    await expect(service.create(dto, userId)).resolves.toEqual(taskDto);
    expect(taskCreateService.create).toHaveBeenCalledWith(dto, userId);
  });

  it('delegates createInWorkspaceKey to TaskCreateService', async () => {
    taskCreateService.createInWorkspaceKey.mockResolvedValue(taskDto);
    await expect(
      service.createInWorkspaceKey('TESKB', { title: 'Task' }, userId),
    ).resolves.toEqual(taskDto);
    expect(taskCreateService.createInWorkspaceKey).toHaveBeenCalledWith(
      'TESKB',
      { title: 'Task' },
      userId,
    );
  });

  it('delegates createInWorkspaceId to TaskCreateService', async () => {
    taskCreateService.createInWorkspaceId.mockResolvedValue(taskDto);
    await expect(
      service.createInWorkspaceId(workspaceId, { title: 'Task' }, userId),
    ).resolves.toEqual(taskDto);
    expect(taskCreateService.createInWorkspaceId).toHaveBeenCalledWith(
      workspaceId,
      { title: 'Task' },
      userId,
    );
  });

  // ─── Query delegation ─────────────────────────────────══════════════════

  it('delegates findAll to TaskQueryService', async () => {
    taskQueryService.findAll.mockResolvedValue(taskListDto);
    await expect(service.findAll({ workspaceId }, userId)).resolves.toEqual(
      taskListDto,
    );
    expect(taskQueryService.findAll).toHaveBeenCalledWith(
      { workspaceId },
      userId,
    );
  });

  it('delegates findByWorkspace to TaskQueryService', async () => {
    taskQueryService.findByWorkspace.mockResolvedValue([taskDto]);
    await expect(service.findByWorkspace(workspaceId, userId)).resolves.toEqual(
      [taskDto],
    );
    expect(taskQueryService.findByWorkspace).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
  });

  it('delegates findByWorkspaceKey to TaskQueryService', async () => {
    const filters = { status: ['todo'] };
    taskQueryService.findByWorkspaceKey.mockResolvedValue(taskListDto);
    await expect(
      service.findByWorkspaceKey('TESKB', userId, filters as any),
    ).resolves.toEqual(taskListDto);
    expect(taskQueryService.findByWorkspaceKey).toHaveBeenCalledWith(
      'TESKB',
      userId,
      filters,
    );
  });

  it('delegates findByWorkspaceId to TaskQueryService', async () => {
    taskQueryService.findByWorkspaceId.mockResolvedValue(taskListDto);
    await expect(
      service.findByWorkspaceId(workspaceId, userId),
    ).resolves.toEqual(taskListDto);
    expect(taskQueryService.findByWorkspaceId).toHaveBeenCalledWith(
      workspaceId,
      userId,
      {},
    );
  });

  it('delegates findArchivedByWorkspaceKey to TaskQueryService', async () => {
    taskQueryService.findArchivedByWorkspaceKey.mockResolvedValue(taskListDto);
    await expect(
      service.findArchivedByWorkspaceKey('TESKB', userId),
    ).resolves.toEqual(taskListDto);
    expect(taskQueryService.findArchivedByWorkspaceKey).toHaveBeenCalledWith(
      'TESKB',
      userId,
      {},
    );
  });

  it('delegates findArchivedByWorkspaceId to TaskQueryService', async () => {
    taskQueryService.findArchivedByWorkspaceId.mockResolvedValue(taskListDto);
    await expect(
      service.findArchivedByWorkspaceId(workspaceId, userId),
    ).resolves.toEqual(taskListDto);
    expect(taskQueryService.findArchivedByWorkspaceId).toHaveBeenCalledWith(
      workspaceId,
      userId,
      {},
    );
  });

  it('delegates findBacklogByWorkspaceKey to TaskQueryService', async () => {
    taskQueryService.findBacklogByWorkspaceKey.mockResolvedValue([taskDto]);
    await expect(
      service.findBacklogByWorkspaceKey('TESKB', userId),
    ).resolves.toEqual([taskDto]);
    expect(taskQueryService.findBacklogByWorkspaceKey).toHaveBeenCalledWith(
      'TESKB',
      userId,
    );
  });

  it('delegates findBacklogByWorkspaceId to TaskQueryService', async () => {
    taskQueryService.findBacklogByWorkspaceId.mockResolvedValue([taskDto]);
    await expect(
      service.findBacklogByWorkspaceId(workspaceId, userId),
    ).resolves.toEqual([taskDto]);
    expect(taskQueryService.findBacklogByWorkspaceId).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
  });

  it('delegates findActiveSprintBoardByWorkspaceKey to TaskQueryService', async () => {
    taskQueryService.findActiveSprintBoardByWorkspaceKey.mockResolvedValue([
      taskDto,
    ]);
    await expect(
      service.findActiveSprintBoardByWorkspaceKey('TESKB', userId),
    ).resolves.toEqual([taskDto]);
    expect(
      taskQueryService.findActiveSprintBoardByWorkspaceKey,
    ).toHaveBeenCalledWith('TESKB', userId);
  });

  it('delegates findActiveSprintBoardByWorkspaceId to TaskQueryService', async () => {
    taskQueryService.findActiveSprintBoardByWorkspaceId.mockResolvedValue([
      taskDto,
    ]);
    await expect(
      service.findActiveSprintBoardByWorkspaceId(workspaceId, userId),
    ).resolves.toEqual([taskDto]);
    expect(
      taskQueryService.findActiveSprintBoardByWorkspaceId,
    ).toHaveBeenCalledWith(workspaceId, userId);
  });

  it('delegates findTasksBySprintInWorkspaceKey to TaskQueryService', async () => {
    const sprintId = new Types.ObjectId().toString();
    taskQueryService.findTasksBySprintInWorkspaceKey.mockResolvedValue([
      taskDto,
    ]);
    await expect(
      service.findTasksBySprintInWorkspaceKey('TESKB', sprintId, userId),
    ).resolves.toEqual([taskDto]);
    expect(
      taskQueryService.findTasksBySprintInWorkspaceKey,
    ).toHaveBeenCalledWith('TESKB', sprintId, userId);
  });

  it('delegates findTasksBySprintInWorkspaceId to TaskQueryService', async () => {
    const sprintId = new Types.ObjectId().toString();
    taskQueryService.findTasksBySprintInWorkspaceId.mockResolvedValue([
      taskDto,
    ]);
    await expect(
      service.findTasksBySprintInWorkspaceId(workspaceId, sprintId, userId),
    ).resolves.toEqual([taskDto]);
    expect(
      taskQueryService.findTasksBySprintInWorkspaceId,
    ).toHaveBeenCalledWith(workspaceId, sprintId, userId);
  });

  it('delegates findById to TaskQueryService', async () => {
    taskQueryService.findById.mockResolvedValue(taskDto);
    await expect(service.findById(taskId)).resolves.toEqual(taskDto);
    expect(taskQueryService.findById).toHaveBeenCalledWith(taskId);
  });

  it('delegates findByIdInWorkspaceKey to TaskQueryService', async () => {
    taskQueryService.findByIdInWorkspaceKey.mockResolvedValue(taskDto);
    await expect(
      service.findByIdInWorkspaceKey('TESKB', taskId, userId),
    ).resolves.toEqual(taskDto);
    expect(taskQueryService.findByIdInWorkspaceKey).toHaveBeenCalledWith(
      'TESKB',
      taskId,
      userId,
    );
  });

  it('delegates findByIdInWorkspaceId to TaskQueryService', async () => {
    taskQueryService.findByIdInWorkspaceId.mockResolvedValue(taskDto);
    await expect(
      service.findByIdInWorkspaceId(workspaceId, taskId, userId),
    ).resolves.toEqual(taskDto);
    expect(taskQueryService.findByIdInWorkspaceId).toHaveBeenCalledWith(
      workspaceId,
      taskId,
      userId,
    );
  });

  it('delegates findByIdForAccessCheck to TaskQueryService', async () => {
    taskQueryService.findByIdForAccessCheck.mockResolvedValue(taskDto);
    await expect(service.findByIdForAccessCheck(taskId)).resolves.toEqual(
      taskDto,
    );
    expect(taskQueryService.findByIdForAccessCheck).toHaveBeenCalledWith(
      taskId,
    );
  });

  it('delegates findByKey to TaskQueryService', async () => {
    taskQueryService.findByKey.mockResolvedValue(taskDto);
    await expect(service.findByKey('TESKB-1')).resolves.toEqual(taskDto);
    expect(taskQueryService.findByKey).toHaveBeenCalledWith('TESKB-1');
  });

  it('delegates findByKeyInWorkspaceKey to TaskQueryService', async () => {
    taskQueryService.findByKeyInWorkspaceKey.mockResolvedValue(taskDto);
    await expect(
      service.findByKeyInWorkspaceKey('TESKB', 'TESKB-1', userId),
    ).resolves.toEqual(taskDto);
    expect(taskQueryService.findByKeyInWorkspaceKey).toHaveBeenCalledWith(
      'TESKB',
      'TESKB-1',
      userId,
    );
  });

  it('delegates findByKeyInWorkspace to TaskQueryService', async () => {
    taskQueryService.findByKeyInWorkspace.mockResolvedValue(taskDto);
    await expect(
      service.findByKeyInWorkspace('TESKB', 'TESKB-1', userId),
    ).resolves.toEqual(taskDto);
    expect(taskQueryService.findByKeyInWorkspace).toHaveBeenCalledWith(
      'TESKB',
      'TESKB-1',
      userId,
    );
  });

  it('delegates findByKeyInWorkspaceId to TaskQueryService', async () => {
    taskQueryService.findByKeyInWorkspaceId.mockResolvedValue(taskDto);
    await expect(
      service.findByKeyInWorkspaceId(workspaceId, 'TESKB-1', userId),
    ).resolves.toEqual(taskDto);
    expect(taskQueryService.findByKeyInWorkspaceId).toHaveBeenCalledWith(
      workspaceId,
      'TESKB-1',
      userId,
    );
  });

  it('delegates findCalendarByWorkspaceId to TaskQueryService', async () => {
    const result = { tasks: [taskDto] };
    taskQueryService.findCalendarByWorkspaceId.mockResolvedValue(result);
    await expect(
      service.findCalendarByWorkspaceId(workspaceId, 2026, 6, userId),
    ).resolves.toEqual(result);
    expect(taskQueryService.findCalendarByWorkspaceId).toHaveBeenCalledWith(
      workspaceId,
      2026,
      6,
      userId,
    );
  });

  it('delegates findTimelineHierarchyByWorkspaceId to TaskQueryService', async () => {
    const result = { epics: [], children: [], standalones: [taskDto] };
    taskQueryService.findTimelineHierarchyByWorkspaceId.mockResolvedValue(
      result,
    );
    await expect(
      service.findTimelineHierarchyByWorkspaceId(workspaceId, userId),
    ).resolves.toEqual(result);
    expect(
      taskQueryService.findTimelineHierarchyByWorkspaceId,
    ).toHaveBeenCalledWith(workspaceId, userId);
  });

  // ─── Update delegation ────────────────────────────────────────────────

  it('delegates update to TaskUpdateService', async () => {
    const dto: UpdateTaskDto = { title: 'Updated' };
    taskUpdateService.update.mockResolvedValue(taskDto);
    await expect(service.update(taskId, dto)).resolves.toEqual(taskDto);
    expect(taskUpdateService.update).toHaveBeenCalledWith(taskId, dto);
  });

  it('delegates updateInWorkspaceKey to TaskUpdateService', async () => {
    const dto: UpdateTaskDto = { title: 'Updated' };
    taskUpdateService.updateInWorkspaceKey.mockResolvedValue(taskDto);
    await expect(
      service.updateInWorkspaceKey('TESKB', taskId, dto, userId),
    ).resolves.toEqual(taskDto);
    expect(taskUpdateService.updateInWorkspaceKey).toHaveBeenCalledWith(
      'TESKB',
      taskId,
      dto,
      userId,
    );
  });

  it('delegates updateInWorkspaceId to TaskUpdateService', async () => {
    const dto: UpdateTaskDto = { title: 'Updated' };
    taskUpdateService.updateInWorkspaceId.mockResolvedValue(taskDto);
    await expect(
      service.updateInWorkspaceId(workspaceId, taskId, dto, userId),
    ).resolves.toEqual(taskDto);
    expect(taskUpdateService.updateInWorkspaceId).toHaveBeenCalledWith(
      workspaceId,
      taskId,
      dto,
      userId,
      undefined,
    );
  });

  // ─── Lifecycle delegation ──────────────────────────────────────────────

  it('delegates archiveInWorkspaceKey to TaskLifecycleService', async () => {
    taskLifecycleService.archiveInWorkspaceKey.mockResolvedValue(taskDto);
    await expect(
      service.archiveInWorkspaceKey('TESKB', taskId, userId),
    ).resolves.toEqual(taskDto);
    expect(taskLifecycleService.archiveInWorkspaceKey).toHaveBeenCalledWith(
      'TESKB',
      taskId,
      userId,
    );
  });

  it('delegates archiveInWorkspaceId to TaskLifecycleService', async () => {
    taskLifecycleService.archiveInWorkspaceId.mockResolvedValue(taskDto);
    await expect(
      service.archiveInWorkspaceId(workspaceId, taskId, userId),
    ).resolves.toEqual(taskDto);
    expect(taskLifecycleService.archiveInWorkspaceId).toHaveBeenCalledWith(
      workspaceId,
      taskId,
      userId,
    );
  });

  it('delegates restoreInWorkspaceKey to TaskLifecycleService', async () => {
    taskLifecycleService.restoreInWorkspaceKey.mockResolvedValue(taskDto);
    await expect(
      service.restoreInWorkspaceKey('TESKB', taskId, userId),
    ).resolves.toEqual(taskDto);
    expect(taskLifecycleService.restoreInWorkspaceKey).toHaveBeenCalledWith(
      'TESKB',
      taskId,
      userId,
    );
  });

  it('delegates restoreInWorkspaceId to TaskLifecycleService', async () => {
    taskLifecycleService.restoreInWorkspaceId.mockResolvedValue(taskDto);
    await expect(
      service.restoreInWorkspaceId(workspaceId, taskId, userId),
    ).resolves.toEqual(taskDto);
    expect(taskLifecycleService.restoreInWorkspaceId).toHaveBeenCalledWith(
      workspaceId,
      taskId,
      userId,
    );
  });

  it('delegates deletePermanentlyInWorkspaceKey to TaskLifecycleService', async () => {
    taskLifecycleService.deletePermanentlyInWorkspaceKey.mockResolvedValue(
      taskDto,
    );
    await expect(
      service.deletePermanentlyInWorkspaceKey(
        'TESKB',
        taskId,
        userId,
        'delete',
      ),
    ).resolves.toEqual(taskDto);
    expect(
      taskLifecycleService.deletePermanentlyInWorkspaceKey,
    ).toHaveBeenCalledWith('TESKB', taskId, userId, 'delete');
  });

  it('delegates deletePermanentlyInWorkspaceId to TaskLifecycleService', async () => {
    taskLifecycleService.deletePermanentlyInWorkspaceId.mockResolvedValue(
      taskDto,
    );
    await expect(
      service.deletePermanentlyInWorkspaceId(
        workspaceId,
        taskId,
        userId,
        'delete',
      ),
    ).resolves.toEqual(taskDto);
    expect(
      taskLifecycleService.deletePermanentlyInWorkspaceId,
    ).toHaveBeenCalledWith(workspaceId, taskId, userId, 'delete');
  });

  it('delegates archiveTaskKeyInWorkspace to TaskLifecycleService', async () => {
    taskLifecycleService.archiveTaskKeyInWorkspace.mockResolvedValue(taskDto);
    await expect(
      service.archiveTaskKeyInWorkspace('TESKB', 'TESKB-1', userId),
    ).resolves.toEqual(taskDto);
    expect(taskLifecycleService.archiveTaskKeyInWorkspace).toHaveBeenCalledWith(
      'TESKB',
      'TESKB-1',
      userId,
    );
  });

  it('delegates restoreTaskKeyInWorkspace to TaskLifecycleService', async () => {
    taskLifecycleService.restoreTaskKeyInWorkspace.mockResolvedValue(taskDto);
    await expect(
      service.restoreTaskKeyInWorkspace('TESKB', 'TESKB-1', userId),
    ).resolves.toEqual(taskDto);
    expect(taskLifecycleService.restoreTaskKeyInWorkspace).toHaveBeenCalledWith(
      'TESKB',
      'TESKB-1',
      userId,
    );
  });

  it('delegates deleteTaskKeyPermanentlyInWorkspace to TaskLifecycleService', async () => {
    taskLifecycleService.deleteTaskKeyPermanentlyInWorkspace.mockResolvedValue(
      taskDto,
    );
    await expect(
      service.deleteTaskKeyPermanentlyInWorkspace(
        'TESKB',
        'TESKB-1',
        userId,
        'delete',
      ),
    ).resolves.toEqual(taskDto);
    expect(
      taskLifecycleService.deleteTaskKeyPermanentlyInWorkspace,
    ).toHaveBeenCalledWith('TESKB', 'TESKB-1', userId, 'delete');
  });

  it('preserves error propagation from delegated services', async () => {
    taskQueryService.findById.mockRejectedValue(
      new NotFoundException('Task not found'),
    );
    await expect(service.findById('nonexistent')).rejects.toThrow(
      NotFoundException,
    );
  });
});
