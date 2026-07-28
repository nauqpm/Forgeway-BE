import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { KANBAN_ERROR_CODES } from '@/common/constants/error-codes.constants';
import { KanbanBoardColumnDto } from '../dtos/kanban.dto';
import { BoardDocument } from '../schemas/kanban-board.schema';
import { KanbanService } from './kanban.service';

describe('KanbanService column name validation', () => {
  const boardId = new Types.ObjectId();
  const workspaceId = new Types.ObjectId();
  const initialColumns: KanbanBoardColumnDto[] = [
    { id: 'todo', name: 'To Do', order: 0, mappedStatuses: ['todo'] },
    {
      id: 'progress',
      name: 'In Progress',
      order: 1,
      mappedStatuses: ['in-progress'],
    },
  ];

  let service: KanbanService;
  let emitBoardDelta: jest.Mock;
  let saveColumnsWithVersion: jest.Mock;

  const createBoard = (
    columns: KanbanBoardColumnDto[] = initialColumns,
  ): BoardDocument =>
    ({
      _id: boardId,
      workspaceId,
      columns,
      __v: 0,
    }) as unknown as BoardDocument;

  beforeEach(() => {
    emitBoardDelta = jest.fn();
    service = new KanbanService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { del: jest.fn() } as never,
      { emitBoardDelta } as never,
    );

    jest.spyOn(service, 'findById').mockResolvedValue(createBoard());
    saveColumnsWithVersion = jest.fn(
      async (_board: BoardDocument, columns: KanbanBoardColumnDto[]) =>
        createBoard(columns),
    );
    Object.defineProperty(service, 'saveColumnsWithVersion', {
      value: saveColumnsWithVersion,
    });
  });

  it('rejects a duplicate column on create without saving or emitting realtime', async () => {
    const operation = service.addColumn(boardId.toString(), {
      name: '  in   PROGRESS ',
    });

    await expect(operation).rejects.toBeInstanceOf(ConflictException);
    await operation.catch(error => {
      expect((error as ConflictException).getResponse()).toEqual({
        message: 'A column with this name already exists.',
        code: KANBAN_ERROR_CODES.DUPLICATE_COLUMN_NAME,
      });
    });
    expect(saveColumnsWithVersion).not.toHaveBeenCalled();
    expect(emitBoardDelta).not.toHaveBeenCalled();
  });

  it('rejects an empty normalized column name', async () => {
    const operation = service.addColumn(boardId.toString(), {
      name: ' \t\n ',
    });

    await expect(operation).rejects.toBeInstanceOf(BadRequestException);
    await operation.catch(error => {
      expect((error as BadRequestException).getResponse()).toEqual({
        message: 'Column name must not be empty.',
        code: KANBAN_ERROR_CODES.INVALID_COLUMN_NAME,
      });
    });
    expect(saveColumnsWithVersion).not.toHaveBeenCalled();
    expect(emitBoardDelta).not.toHaveBeenCalled();
  });

  it('normalizes the display name before creating a column', async () => {
    await service.addColumn(boardId.toString(), {
      name: '  Ｃｏｄｅ   Review ',
    });

    const savedColumns = saveColumnsWithVersion.mock.calls[0][1];
    expect(savedColumns.at(-1)).toMatchObject({ name: 'Code Review' });
    expect(emitBoardDelta).toHaveBeenCalledTimes(1);
  });

  it('allows a column to keep its own name when renamed with different casing', async () => {
    await service.updateColumn(boardId.toString(), 'progress', {
      name: '  IN   PROGRESS ',
    });

    const savedColumns = saveColumnsWithVersion.mock.calls[0][1];
    expect(savedColumns.find(column => column.id === 'progress')).toMatchObject(
      {
        name: 'IN PROGRESS',
      },
    );
    expect(emitBoardDelta).toHaveBeenCalledTimes(1);
  });

  it('rejects a rename that conflicts with another column', async () => {
    await expect(
      service.updateColumn(boardId.toString(), 'progress', {
        name: ' to   DO ',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(saveColumnsWithVersion).not.toHaveBeenCalled();
    expect(emitBoardDelta).not.toHaveBeenCalled();
  });

  it('rejects duplicate names when replacing all columns', async () => {
    await expect(
      service.replaceColumns(boardId.toString(), [
        { id: 'one', name: 'Review', order: 0, mappedStatuses: [] },
        { id: 'two', name: ' REVIEW ', order: 1, mappedStatuses: [] },
      ]),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(saveColumnsWithVersion).not.toHaveBeenCalled();
    expect(emitBoardDelta).not.toHaveBeenCalled();
  });
});

describe('KanbanService deleteColumn task migration and realtime payload', () => {
  const boardId = new Types.ObjectId();
  const workspaceId = new Types.ObjectId();
  const initialColumns: KanbanBoardColumnDto[] = [
    { id: 'col-1', name: 'Column 1', order: 0, mappedStatuses: [] },
    { id: 'col-2', name: 'Column 2', order: 1, mappedStatuses: [] },
    { id: 'col-3', name: 'Column 3', order: 2, mappedStatuses: [] },
  ];

  let service: KanbanService;
  let emitBoardDelta: jest.Mock;
  let saveColumnsWithVersion: jest.Mock;
  let countDocumentsMock: jest.Mock;
  let updateManyMock: jest.Mock;

  const createBoard = (
    columns: KanbanBoardColumnDto[] = initialColumns,
  ): BoardDocument =>
    ({
      _id: boardId,
      workspaceId,
      columns,
      __v: 0,
    }) as unknown as BoardDocument;

  beforeEach(() => {
    emitBoardDelta = jest.fn();
    countDocumentsMock = jest.fn();
    updateManyMock = jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });

    const taskModelMock = {
      countDocuments: countDocumentsMock,
      updateMany: updateManyMock,
    };

    const mockConnection = {
      startSession: jest.fn().mockResolvedValue({
        withTransaction: jest
          .fn()
          .mockImplementation(async (cb: () => Promise<void>) => {
            await cb();
          }),
        endSession: jest.fn().mockResolvedValue(undefined),
      }),
    };

    service = new KanbanService(
      {} as never,
      taskModelMock as never,
      {} as never,
      mockConnection as never,
      { del: jest.fn() } as never,
      { emitBoardDelta } as never,
    );

    jest
      .spyOn(service, 'findById')
      .mockImplementation(async () => createBoard());

    saveColumnsWithVersion = jest.fn(
      async (_board: BoardDocument, columns: KanbanBoardColumnDto[]) =>
        createBoard(columns),
    );
    Object.defineProperty(service, 'saveColumnsWithVersion', {
      value: saveColumnsWithVersion,
    });
  });

  it('throws BadRequestException when deleting a column with active tasks without targetColumnId', async () => {
    countDocumentsMock.mockImplementation((query: Record<string, unknown>) => {
      if (query.isArchived && typeof query.isArchived === 'object') {
        return { exec: jest.fn().mockResolvedValue(3) }; // 3 active tasks
      }
      return { exec: jest.fn().mockResolvedValue(0) };
    });

    await expect(
      service.deleteColumn(boardId.toString(), 'col-1'),
    ).rejects.toThrow(BadRequestException);

    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('uses targetColumnId for active tasks, archivedTargetColumnId for archived tasks, and emits correct task counts in realtime payload', async () => {
    countDocumentsMock.mockImplementation((query: Record<string, unknown>) => {
      if (query.isArchived && typeof query.isArchived === 'object') {
        return { exec: jest.fn().mockResolvedValue(5) }; // 5 active tasks
      }
      if (query.isArchived === true) {
        return { exec: jest.fn().mockResolvedValue(2) }; // 2 archived tasks
      }
      return { exec: jest.fn().mockResolvedValue(0) };
    });

    await service.deleteColumn(
      boardId.toString(),
      'col-1',
      'col-2', // targetColumnId for active tasks
      'col-3', // archivedTargetColumnId for archived tasks
    );

    // Active task update filter & payload
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        columnId: 'col-1',
        isArchived: { $ne: true },
      }),
      { $set: { columnId: 'col-2', status: 'column 2' } },
      expect.anything(),
    );

    // Archived task update filter & payload
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        columnId: 'col-1',
        isArchived: true,
      }),
      { $set: { columnId: 'col-3', status: 'column 3' } },
      expect.anything(),
    );

    // Realtime delta payload checks
    expect(emitBoardDelta).toHaveBeenCalledWith(
      workspaceId.toString(),
      'column:deleted',
      {
        boardId: boardId.toString(),
        columnId: 'col-1',
        targetColumnId: 'col-2',
        archivedTargetColumnId: 'col-3',
        migratedTaskCount: 5,
        migratedArchivedTaskCount: 2,
      },
      expect.anything(),
    );
  });

  it('falls back to targetColumnId then first remaining column when archivedTargetColumnId is not provided', async () => {
    countDocumentsMock.mockImplementation((query: Record<string, unknown>) => {
      if (query.isArchived && typeof query.isArchived === 'object') {
        return { exec: jest.fn().mockResolvedValue(0) }; // 0 active tasks
      }
      if (query.isArchived === true) {
        return { exec: jest.fn().mockResolvedValue(4) }; // 4 archived tasks
      }
      return { exec: jest.fn().mockResolvedValue(0) };
    });

    // Delete col-1 without targetColumnId or archivedTargetColumnId (since activeTaskCount = 0)
    await service.deleteColumn(boardId.toString(), 'col-1');

    // Remaining columns after deleting col-1 are col-2 and col-3; fallback is col-2
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        columnId: 'col-1',
        isArchived: true,
      }),
      { $set: { columnId: 'col-2', status: 'column 2' } },
      expect.anything(),
    );

    expect(emitBoardDelta).toHaveBeenCalledWith(
      workspaceId.toString(),
      'column:deleted',
      {
        boardId: boardId.toString(),
        columnId: 'col-1',
        targetColumnId: 'col-2',
        archivedTargetColumnId: 'col-2',
        migratedTaskCount: 0,
        migratedArchivedTaskCount: 4,
      },
      expect.anything(),
    );
  });
});
