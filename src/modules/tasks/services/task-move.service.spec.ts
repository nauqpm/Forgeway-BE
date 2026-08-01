import { BadRequestException } from '@nestjs/common';
import { TaskMoveService } from './task-move.service';

describe('TaskMoveService story requirements gate', () => {
  const workspaceId = '507f1f77bcf86cd799439011';
  const taskId = '507f1f77bcf86cd799439012';

  const createService = (
    requirementsState = 'REBASE_REQUIRED',
    workflowStatuses: Array<Record<string, string>> = [
      { id: 'review', category: 'inprogress', requirementsGate: 'review' },
      { id: 'done', category: 'done' },
    ],
  ) => {
    const task = {
      _id: taskId,
      workspaceId,
      key: 'WORK-1',
      status: 'inprogress',
      rank: 'a0',
      requirementsState,
      isArchived: false,
      isDeleted: false,
    };
    const taskReadRepository = {
      findByIdInWorkspace: jest.fn().mockResolvedValue(task),
    };
    const taskRankRepository = {
      moveTaskInWorkspace: jest
        .fn()
        .mockResolvedValue({ ...task, status: 'done' }),
    };
    const validationService = {
      getWorkspaceById: jest.fn().mockResolvedValue({ type: 'kanban' }),
      validateWorkspaceMember: jest.fn().mockResolvedValue(undefined),
      validateObjectId: jest.fn(),
    };
    const workflowService = {
      findByWorkspace: jest.fn().mockResolvedValue({
        statuses: workflowStatuses,
      }),
    };

    return {
      service: new TaskMoveService(
        taskReadRepository as any,
        taskRankRepository as any,
        validationService as any,
        { findByIdInWorkspace: jest.fn() } as any,
        { validateMove: jest.fn() },
        { mapToDto: jest.fn(value => value) } as any,
        { recordTaskMoved: jest.fn() } as any,
        { publishMoved: jest.fn() } as any,
        workflowService as unknown as import('../../workflows/services/workflows.service').WorkflowsService,
      ),
      taskRankRepository,
      workflowService,
    };
  };

  it('blocks REBASE_REQUIRED work from every done-category status before persistence', async () => {
    const { service, taskRankRepository } = createService();

    await expect(
      service.moveInWorkspaceId(
        workspaceId,
        taskId,
        { status: 'done' },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(taskRankRepository.moveTaskInWorkspace).not.toHaveBeenCalled();
  });

  it.each(['REVIEW_REQUIRED', 'REBASE_REQUIRED'])(
    'blocks %s work from the explicit review gate',
    async requirementsState => {
      const { service, taskRankRepository } = createService(requirementsState);

      await expect(
        service.moveInWorkspaceId(
          workspaceId,
          taskId,
          { status: 'review' },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(taskRankRepository.moveTaskInWorkspace).not.toHaveBeenCalled();
    },
  );

  it('still blocks done when a custom workflow has no review marker', async () => {
    const { service } = createService('REVIEW_REQUIRED', [
      { id: 'qa', category: 'inprogress' },
      { id: 'released', category: 'done' },
    ]);

    await expect(
      service.moveInWorkspaceId(
        workspaceId,
        taskId,
        { status: 'released' },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows non-status movement even when the current status is a gate', async () => {
    const { service, taskRankRepository, workflowService } = createService();
    taskRankRepository.moveTaskInWorkspace.mockResolvedValue({
      _id: taskId,
      workspaceId,
      key: 'WORK-1',
      status: 'review',
      rank: 'b0',
      requirementsState: 'REBASE_REQUIRED',
    });

    await expect(
      service.moveInWorkspaceId(workspaceId, taskId, { rank: 'b0' }, 'user-1'),
    ).resolves.toEqual(expect.any(Object));
    expect(workflowService.findByWorkspace).not.toHaveBeenCalled();
  });

  it('allows CURRENT work through review and done statuses', async () => {
    const { service, taskRankRepository } = createService('CURRENT');

    await expect(
      service.moveInWorkspaceId(
        workspaceId,
        taskId,
        { status: 'done' },
        'user-1',
      ),
    ).resolves.toEqual(expect.any(Object));
    expect(taskRankRepository.moveTaskInWorkspace).toHaveBeenCalled();
  });
});
