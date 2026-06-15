import { Types } from 'mongoose';
import { TaskSearchService } from '../services/task-search.service';
import { TaskQueryBuilder } from './task-query.builder';

describe('TaskQueryBuilder', () => {
  let queryBuilder: TaskQueryBuilder;

  beforeEach(() => {
    queryBuilder = new TaskQueryBuilder(new TaskSearchService());
  });

  it('builds a multi-select status filter with all requested status values', () => {
    const workspaceId = new Types.ObjectId().toString();
    const filter = queryBuilder.buildFilter({
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
    const filter = queryBuilder.buildFilter({
      workspaceId,
      taskKey: 'TESKB-12',
    });

    expect(filter.workspaceId.toString()).toBe(workspaceId);
    expect(filter.key).toBe('TESKB-12');
    expect(filter.$text).toBeUndefined();
  });

  it('normalizes explicit task key filters before querying', () => {
    const workspaceId = new Types.ObjectId().toString();
    const filter = queryBuilder.buildFilter({
      workspaceId,
      taskKey: ' teskb-12 ',
    });

    expect(filter.workspaceId.toString()).toBe(workspaceId);
    expect(filter.key).toBe('TESKB-12');
    expect(filter.$text).toBeUndefined();
  });

  it('auto-detects task key search and skips text search', () => {
    const workspaceId = new Types.ObjectId().toString();
    const filter = queryBuilder.buildFilter({
      workspaceId,
      search: 'TESKB-12',
    });

    expect(filter.workspaceId.toString()).toBe(workspaceId);
    expect(filter.key).toBe('TESKB-12');
    expect(filter.$text).toBeUndefined();
    expect(filter.$or).toBeUndefined();
  });

  it('uses indexed search tokens for one-character search', () => {
    const workspaceId = new Types.ObjectId().toString();
    const filter = queryBuilder.buildFilter({
      workspaceId,
      search: 'R',
    });

    expect(filter.workspaceId.toString()).toBe(workspaceId);
    expect(filter.searchTokens).toBe('r');
    expect(filter.$or).toBeUndefined();
    expect(filter.$text).toBeUndefined();
  });

  it('keeps partial regex search when search is not a full task key', () => {
    const workspaceId = new Types.ObjectId().toString();
    const filter = queryBuilder.buildFilter({
      workspaceId,
      search: 'Re',
    });

    expect(filter.workspaceId.toString()).toBe(workspaceId);
    expect(filter.key).toBeUndefined();
    expect(filter.$text).toBeUndefined();
    expect(filter.$or).toEqual([
      { key: { $regex: 'Re', $options: 'i' } },
      { title: { $regex: 'Re', $options: 'i' } },
      { description: { $regex: 'Re', $options: 'i' } },
    ]);
  });

  it('combines partial search with existing filters', () => {
    const workspaceId = new Types.ObjectId().toString();
    const assigneeId = new Types.ObjectId().toString();
    const filter = queryBuilder.buildFilter({
      workspaceId,
      assigneeId,
      status: ['todo'],
      search: 'Re',
    });

    expect(filter.workspaceId.toString()).toBe(workspaceId);
    expect(filter.assigneeId.toString()).toBe(assigneeId);
    expect(filter.status).toEqual({ $in: ['todo'] });
    expect(filter.$or).toEqual([
      { key: { $regex: 'Re', $options: 'i' } },
      { title: { $regex: 'Re', $options: 'i' } },
      { description: { $regex: 'Re', $options: 'i' } },
    ]);
  });
});
