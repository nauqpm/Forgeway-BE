import { BadRequestException } from '@nestjs/common';
import { UnmappableStatusException } from '../exceptions/unmappable-status.exception';
import { TaskCreationValidationService } from './task-creation-validation.service';

describe('TaskCreationValidationService type transitions', () => {
  const workspaceId = '64f000000000000000000001';
  const boardId = '64f000000000000000000002';
  const kanbanService = { findById: jest.fn() };
  let service: TaskCreationValidationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TaskCreationValidationService(
      { findById: jest.fn() } as any,
      {} as any,
      kanbanService as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  const existingTask = {
    type: 'task',
    status: 'todo',
    columnId: 'todo',
    boardId,
    workspaceId: { type: 'kanban' },
  };

  it.each(['subtask', 'epic'])('rejects changing a task to %s', async type => {
    await expect(
      service.validateUpdateRequest({ type }, workspaceId, existingTask),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(kanbanService.findById).not.toHaveBeenCalled();
  });

  it('rejects a type change when the current status is not in the workflow', async () => {
    kanbanService.findById.mockResolvedValue({
      columns: [{ id: 'done', name: 'Done', mappedStatuses: ['done'] }],
    });

    await expect(
      service.validateUpdateRequest(
        { type: 'story' },
        workspaceId,
        existingTask,
      ),
    ).rejects.toBeInstanceOf(UnmappableStatusException);
  });

  it('allows a type change when the current status belongs to the workflow', async () => {
    kanbanService.findById.mockResolvedValue({
      columns: [{ id: 'todo', name: 'To Do', mappedStatuses: ['todo'] }],
    });

    await expect(
      service.validateUpdateRequest(
        { type: 'story' },
        workspaceId,
        existingTask,
      ),
    ).resolves.toBeUndefined();
  });
});
