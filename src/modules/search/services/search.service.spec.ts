import { Types } from 'mongoose';

import { SearchService } from './search.service';

const queryResult = <T>(value: T) => {
  const query: Record<string, jest.Mock> = {};
  query.select = jest.fn().mockReturnValue(query);
  query.sort = jest.fn().mockReturnValue(query);
  query.limit = jest.fn().mockReturnValue(query);
  query.lean = jest.fn().mockReturnValue(query);
  query.exec = jest.fn().mockResolvedValue(value);
  return query;
};

describe('SearchService global search', () => {
  it('keeps document access, author and text filters in separate AND clauses', async () => {
    const userId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId();
    const authorId = new Types.ObjectId().toString();
    const documentId = new Types.ObjectId();
    const now = new Date();
    const workspaceQuery = queryResult([
      { _id: workspaceId, name: 'Engineering', key: 'ENG' },
    ]);
    const documentQuery = queryResult([
      {
        _id: documentId,
        workspaceIds: [workspaceId],
        name: 'Search design',
        originalName: 'search-design.pdf',
        filename: 'search-design.pdf',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const workspaceModel = { find: jest.fn().mockReturnValue(workspaceQuery) };
    const pageModel = { find: jest.fn() };
    const documentModel = {
      find: jest.fn().mockReturnValue(documentQuery),
    };
    const auxiliarySearch = { search: jest.fn().mockResolvedValue([]) };
    const service = new SearchService(
      { find: jest.fn() } as never,
      workspaceModel as never,
      pageModel as never,
      { find: jest.fn() } as never,
      documentModel as never,
      auxiliarySearch as never,
    );

    const result = await service.globalSearch(userId, {
      q: 'search',
      types: ['document'],
      authorIds: [authorId],
    });

    const filter = documentModel.find.mock.calls[0][0];
    expect(filter).not.toHaveProperty('$or');
    expect(filter.$and).toHaveLength(3);
    expect(filter.$and[0]).toEqual({
      $or: [
        { uploadedBy: new Types.ObjectId(userId) },
        { workspaceIds: { $in: [workspaceId] } },
      ],
    });
    expect(filter.$and[1]).toEqual({
      uploadedBy: { $in: [new Types.ObjectId(authorId)] },
    });
    expect(filter.$and[2]).toHaveProperty('$or');
    expect(result.items).toEqual([
      expect.objectContaining({
        id: documentId.toString(),
        type: 'document',
      }),
    ]);
    expect(pageModel.find).not.toHaveBeenCalled();
  });

  it('does not query documents when only page results are requested', async () => {
    const workspaceId = new Types.ObjectId();
    const workspaceModel = {
      find: jest
        .fn()
        .mockReturnValue(
          queryResult([{ _id: workspaceId, name: 'Engineering', key: 'ENG' }]),
        ),
    };
    const pageModel = { find: jest.fn().mockReturnValue(queryResult([])) };
    const documentModel = { find: jest.fn() };
    const service = new SearchService(
      { find: jest.fn() } as never,
      workspaceModel as never,
      pageModel as never,
      { find: jest.fn() } as never,
      documentModel as never,
      { search: jest.fn().mockResolvedValue([]) } as never,
    );

    await service.globalSearch(new Types.ObjectId().toString(), {
      q: 'page',
      types: ['page'],
    });

    expect(pageModel.find).toHaveBeenCalledTimes(1);
    expect(documentModel.find).not.toHaveBeenCalled();
  });
});
