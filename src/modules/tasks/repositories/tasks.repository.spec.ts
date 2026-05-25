import { Types } from 'mongoose';

import { TasksRepository } from './tasks.repository';

describe('TasksRepository filters', () => {
  let repository: TasksRepository;

  beforeEach(() => {
    repository = new TasksRepository({} as any);
  });

  it('builds a multi-select status filter with all requested status values', () => {
    const workspaceId = new Types.ObjectId().toString();
    const filter = (repository as any).buildFilter({
      workspaceId,
      status: ['todo', 'inprogress', 'testing', 'done'],
    });

    expect(filter.workspaceId.toString()).toBe(workspaceId);
    expect(filter.status).toEqual({
      $in: ['todo', 'inprogress', 'testing', 'done'],
    });
    expect(filter.isArchived).toEqual({ $ne: true });
    expect(filter.isDeleted).toEqual({ $ne: true });
  });
});
