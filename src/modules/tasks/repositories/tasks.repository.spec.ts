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

  it('builds an exact task key filter scoped by workspace', () => {
    const workspaceId = new Types.ObjectId().toString();
    const filter = (repository as any).buildFilter({
      workspaceId,
      taskKey: 'TESKB-12',
    });

    expect(filter.workspaceId.toString()).toBe(workspaceId);
    expect(filter.key).toBe('TESKB-12');
    expect(filter.$text).toBeUndefined();
  });

  it('normalizes explicit task key filters before querying', () => {
    const workspaceId = new Types.ObjectId().toString();
    const filter = (repository as any).buildFilter({
      workspaceId,
      taskKey: ' teskb-12 ',
    });

    expect(filter.workspaceId.toString()).toBe(workspaceId);
    expect(filter.key).toBe('TESKB-12');
    expect(filter.$text).toBeUndefined();
  });

  it('auto-detects task key search and skips text search', () => {
    const workspaceId = new Types.ObjectId().toString();
    const filter = (repository as any).buildFilter({
      workspaceId,
      search: 'TESKB-12',
    });

    expect(filter.workspaceId.toString()).toBe(workspaceId);
    expect(filter.key).toBe('TESKB-12');
    expect(filter.$text).toBeUndefined();
  });

  it('keeps fuzzy text search when search is not a full task key', () => {
    const workspaceId = new Types.ObjectId().toString();
    const filter = (repository as any).buildFilter({
      workspaceId,
      search: 'TESKB',
    });

    expect(filter.workspaceId.toString()).toBe(workspaceId);
    expect(filter.key).toBeUndefined();
    expect(filter.$text).toEqual({ $search: 'TESKB' });
  });
});
