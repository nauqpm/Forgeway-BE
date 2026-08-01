import { BadRequestException } from '@nestjs/common';
import { TaskReorderService } from './task-reorder.service';

describe('TaskReorderService story requirements gate', () => {
  const workspaceId = '507f1f77bcf86cd799439011';
  const taskId = '507f1f77bcf86cd799439012';

  const createService = (requirementsState = 'REBASE_REQUIRED') => {
    const task = {
      _id: { toString: () => taskId },
      workspaceId,
      key: 'WORK-1',
      columnId: 'doing',
      status: 'doing',
      rank: 'a0',
      requirementsState,
      isArchived: false,
      isDeleted: false,
    };
    const taskRankRepository = {
      findNeighborForReorder: jest.fn(),
      findTasksInRankScope: jest.fn().mockResolvedValue([]),
      reorderTaskInWorkspace: jest.fn(),
      updateRanksInWorkspace: jest.fn(),
    };
    const workflowsService = {
      findByWorkspace: jest.fn().mockResolvedValue({
        statuses: [
          { id: 'review', category: 'inprogress', requirementsGate: 'review' },
          { id: 'done', category: 'done' },
        ],
      }),
    };
    const service = new TaskReorderService(
      { findByIdInWorkspace: jest.fn().mockResolvedValue(task) } as any,
      taskRankRepository as any,
      {
        getWorkspaceById: jest.fn().mockResolvedValue({ type: 'kanban' }),
        validateWorkspaceMember: jest.fn(),
        validateObjectId: jest.fn(),
      } as any,
      { findByIdInWorkspace: jest.fn() } as any,
      { validateReorder: jest.fn() } as any,
      { mapToDto: jest.fn(value => value) } as any,
      { recordTaskMoved: jest.fn() } as any,
      { publishReordered: jest.fn() } as any,
      workflowsService as any,
    );

    return { service, taskRankRepository, workflowsService };
  };

  it.each(['review', 'done'])(
    'blocks a status-changing reorder into %s before rank persistence',
    async status => {
      const { service, taskRankRepository } = createService();

      await expect(
        service.reorderInWorkspaceId(
          workspaceId,
          taskId,
          { status, columnId: 'doing' },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(taskRankRepository.reorderTaskInWorkspace).not.toHaveBeenCalled();
      expect(taskRankRepository.updateRanksInWorkspace).not.toHaveBeenCalled();
    },
  );

  it('does not consult the requirements gate for a reorder that keeps status', async () => {
    const { service, workflowsService } = createService();

    await service
      .reorderInWorkspaceId(
        workspaceId,
        taskId,
        { columnId: 'doing', beforeTaskId: '507f1f77bcf86cd799439013' },
        'user-1',
      )
      .catch(() => undefined);

    expect(workflowsService.findByWorkspace).not.toHaveBeenCalled();
  });
});
