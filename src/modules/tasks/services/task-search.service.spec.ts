import { TaskSearchService } from './task-search.service';

describe('TaskSearchService', () => {
  let service: TaskSearchService;

  beforeEach(() => {
    service = new TaskSearchService();
  });

  it.each([undefined, '', '   '])(
    'returns empty filter for empty search: %p',
    search => {
      expect(service.buildSearchFilter(search)).toEqual({});
    },
  );

  it('uses searchTokens for one-character search', () => {
    expect(service.buildSearchFilter('R')).toEqual({
      searchTokens: 'r',
    });
  });

  it('builds exact task key search without regex', () => {
    expect(service.buildSearchFilter('ALTA-1')).toEqual({
      key: 'ALTA-1',
    });
  });

  it('normalizes lowercase task key search', () => {
    expect(service.buildSearchFilter('alta-1')).toEqual({
      key: 'ALTA-1',
    });
  });

  it('builds partial regex search for key, title, and description', () => {
    const filter = service.buildSearchFilter('Re');

    expect(filter).toEqual({
      $or: [
        { key: { $regex: 'Re', $options: 'i' } },
        { title: { $regex: 'Re', $options: 'i' } },
        { description: { $regex: 'Re', $options: 'i' } },
      ],
    });
  });

  it('escapes regex special characters for partial search', () => {
    const filter = service.buildSearchFilter('Re.*');

    expect(filter).toEqual({
      $or: [
        { key: { $regex: 'Re\\.\\*', $options: 'i' } },
        { title: { $regex: 'Re\\.\\*', $options: 'i' } },
        { description: { $regex: 'Re\\.\\*', $options: 'i' } },
      ],
    });
  });
});
