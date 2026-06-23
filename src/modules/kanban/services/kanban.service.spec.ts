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
