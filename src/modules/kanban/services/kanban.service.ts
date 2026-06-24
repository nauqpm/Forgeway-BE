import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Cache } from 'cache-manager';
import { randomUUID } from 'crypto';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { RealtimeService } from '@/modules/realtime/realtime.service';
import { ErrorFactory } from '@/common/factories/error.factory';
import {
  Workspace,
  WorkspaceDocument,
} from '@/modules/workspaces/schemas/workspace.schema';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import {
  CreateColumnDto,
  KanbanBoardColumnDto,
  MoveColumnDto,
  UpdateColumnDto,
} from '../dtos/kanban.dto';
import {
  Board,
  BoardColumn,
  BoardDocument,
} from '../schemas/kanban-board.schema';
import {
  getColumnNameKey,
  hasDuplicateColumnName,
  isColumnNameEmpty,
  normalizeColumnDisplayName,
} from '../utils/column-name.util';

type VersionedBoardDocument = BoardDocument & { __v?: number };

@Injectable()
export class KanbanService {
  private readonly logger = new Logger(KanbanService.name);
  private readonly boardCacheTtlMs = 60_000;
  private readonly boardLoadLocks = new Map<string, Promise<BoardDocument>>();

  private readonly defaultColumns: KanbanBoardColumnDto[] = [
    { id: 'todo', name: 'To Do', order: 0, mappedStatuses: ['todo'] },
    {
      id: 'inprogress',
      name: 'In Progress',
      order: 1,
      mappedStatuses: ['in-progress'],
    },
    { id: 'done', name: 'Done', order: 2, mappedStatuses: ['done'] },
  ];

  constructor(
    @InjectModel(Board.name) private boardModel: Model<BoardDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Workspace.name)
    private workspaceModel: Model<WorkspaceDocument>,
    @InjectConnection() private connection: Connection,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private realtimeService: RealtimeService,
  ) {}

  public async createDefaultBoard(workspaceId: string): Promise<BoardDocument> {
    this.logger.log(
      `Creating default Kanban board for Workspace: ${workspaceId}`,
    );

    const board = await this.boardModel
      .findOneAndUpdate(
        { workspaceId: new Types.ObjectId(workspaceId) },
        {
          $setOnInsert: {
            workspaceId: new Types.ObjectId(workspaceId),
            name: 'Main Board',
            columns: this.defaultColumns,
            settings: {},
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    return board;
  }

  public async findOrCreateByWorkspaceKey(
    workspaceKey: string,
  ): Promise<BoardDocument> {
    return this.findOrCreateByWorkspaceId(workspaceKey);
  }

  public async findOrCreateByWorkspaceId(
    workspaceId: string,
  ): Promise<BoardDocument> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      throw new BadRequestException('Invalid workspace ID format');
    }

    const cacheKey = this.getBoardCacheKey(workspaceId);
    const cached =
      await this.cacheManager.get<Record<string, unknown>>(cacheKey);
    if (cached) {
      return this.boardModel.hydrate(cached);
    }

    const existingLoad = this.boardLoadLocks.get(workspaceId);
    if (existingLoad) {
      return existingLoad;
    }

    // Collapse a burst of cache misses in this process into one Mongo read/write.
    // Redis handles the cross-request hot path; Mongo's unique workspaceId index keeps
    // the default-board upsert idempotent across multiple Node instances.
    const load = this.loadAndCacheBoard(workspaceId, cacheKey);
    this.boardLoadLocks.set(workspaceId, load);

    try {
      return await load;
    } finally {
      this.boardLoadLocks.delete(workspaceId);
    }
  }

  public async findByWorkspaceKey(
    workspaceKey: string,
  ): Promise<BoardDocument[]> {
    return this.findByWorkspaceId(workspaceKey);
  }

  public async findByWorkspaceId(
    workspaceId: string,
  ): Promise<BoardDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      throw new BadRequestException('Invalid workspace ID format');
    }

    return this.boardModel
      .find({ workspaceId: new Types.ObjectId(workspaceId) })
      .exec();
  }

  public async findById(id: string): Promise<BoardDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid board ID format');
    }

    const board = await this.boardModel.findById(id).exec();
    if (!board) {
      throw new NotFoundException(`Board with id ${id} not found`);
    }
    return board;
  }

  public async replaceColumns(
    id: string,
    columns: KanbanBoardColumnDto[],
  ): Promise<BoardDocument> {
    const board = await this.findById(id);
    const normalizedColumns = this.normalizeAndValidateColumnNames(columns);
    const updated = await this.saveColumnsWithVersion(
      board,
      this.reindexColumns(normalizedColumns),
    );
    const workspaceId = this.toId(updated.workspaceId);

    await this.invalidateBoardCache(workspaceId);
    this.realtimeService.emitBoardDelta(
      workspaceId,
      'board:columns-replaced',
      { boardId: updated._id.toString(), columns: updated.columns },
      this.getVersion(updated),
    );

    return updated;
  }

  public async deleteByWorkspace(workspaceId: string): Promise<void> {
    this.logger.log(`Deleting all boards for Workspace: ${workspaceId}`);
    await this.boardModel
      .deleteMany({ workspaceId: new Types.ObjectId(workspaceId) })
      .exec();
    await this.invalidateBoardCache(workspaceId);
  }

  public async addColumn(
    boardId: string,
    dto: CreateColumnDto,
  ): Promise<BoardDocument> {
    const board = await this.findById(boardId);
    const columns = this.toPlainColumns(board.columns);
    const normalizedName = normalizeColumnDisplayName(dto.name);
    this.validateColumnName(normalizedName);

    if (hasDuplicateColumnName(columns, normalizedName)) {
      throw new ConflictException(ErrorFactory.duplicateColumnName());
    }

    const maxOrder =
      columns.length > 0 ? Math.max(...columns.map(c => c.order)) : -1;
    const newColumn: KanbanBoardColumnDto = {
      id: randomUUID(),
      name: normalizedName,
      order: maxOrder + 1,
      mappedStatuses: [],
    };

    const updated = await this.saveColumnsWithVersion(board, [
      ...columns,
      newColumn,
    ]);
    const workspaceId = this.toId(updated.workspaceId);

    await this.invalidateBoardCache(workspaceId);
    this.realtimeService.emitBoardDelta(
      workspaceId,
      'column:created',
      { boardId, column: newColumn },
      this.getVersion(updated),
    );

    return updated;
  }

  public async updateColumn(
    boardId: string,
    columnId: string,
    dto: UpdateColumnDto,
  ): Promise<BoardDocument> {
    const board = await this.findById(boardId);
    const columns = this.toPlainColumns(board.columns);
    const column = columns.find(c => c.id === columnId);

    if (!column) {
      throw new NotFoundException(
        `Column "${columnId}" not found in board ${boardId}`,
      );
    }

    const normalizedName =
      dto.name === undefined
        ? column.name
        : normalizeColumnDisplayName(dto.name);
    this.validateColumnName(normalizedName);

    if (hasDuplicateColumnName(columns, normalizedName, columnId)) {
      throw new ConflictException(ErrorFactory.duplicateColumnName());
    }

    const nextColumns = columns.map(item =>
      item.id === columnId
        ? {
            ...item,
            name: normalizedName,
            mappedStatuses: dto.mappedStatuses ?? item.mappedStatuses,
          }
        : item,
    );

    const updated = await this.saveColumnsWithVersion(board, nextColumns);
    const workspaceId = this.toId(updated.workspaceId);

    await this.invalidateBoardCache(workspaceId);
    this.realtimeService.emitBoardDelta(
      workspaceId,
      'column:updated',
      {
        boardId,
        columnId,
        column: updated.columns.find(c => c.id === columnId),
      },
      this.getVersion(updated),
    );

    return updated;
  }

  public async updateWipLimit(
    boardId: string,
    columnId: string,
    wipLimit: number | null | undefined,
  ): Promise<BoardDocument> {
    const board = await this.findById(boardId);
    const columns = this.toPlainColumns(board.columns);
    const column = columns.find(c => c.id === columnId);

    if (!column) {
      throw new NotFoundException(
        `Column "${columnId}" not found in board ${boardId}`,
      );
    }

    const nextColumns = columns.map(item =>
      item.id === columnId
        ? { ...item, wipLimit: wipLimit ?? undefined }
        : item,
    );
    const updated = await this.saveColumnsWithVersion(board, nextColumns);
    const workspaceId = this.toId(updated.workspaceId);

    await this.invalidateBoardCache(workspaceId);
    this.realtimeService.emitBoardDelta(
      workspaceId,
      'column:updated',
      { boardId, columnId, patch: { wipLimit: wipLimit ?? undefined } },
      this.getVersion(updated),
    );

    return updated;
  }

  public async deleteColumn(
    boardId: string,
    columnId: string,
    targetColumnId?: string,
  ): Promise<BoardDocument> {
    const board = await this.findById(boardId);
    const columns = this.toPlainColumns(board.columns);
    const columnIndex = columns.findIndex(c => c.id === columnId);

    if (columnIndex === -1) {
      throw new NotFoundException(
        `Column "${columnId}" not found in board ${boardId}`,
      );
    }

    if (targetColumnId) {
      const targetExists = columns.some(
        c => c.id === targetColumnId && c.id !== columnId,
      );
      if (!targetExists) {
        throw new BadRequestException(
          `Target column "${targetColumnId}" not found in board ${boardId}`,
        );
      }
    }

    const workspaceId = this.toId(board.workspaceId);

    const archivedTaskCount = await this.taskModel
      .countDocuments({
        workspaceId: new Types.ObjectId(workspaceId),
        columnId,
        isArchived: true,
      })
      .exec();

    if (archivedTaskCount > 0) {
      throw new BadRequestException(
        `Cannot delete this column because it still contains ${archivedTaskCount} archived task(s). Please permanently delete those tasks first.`,
      );
    }

    const taskCount = await this.taskModel
      .countDocuments({
        workspaceId: new Types.ObjectId(workspaceId),
        columnId,
      })
      .exec();

    if (taskCount > 0 && !targetColumnId) {
      throw new BadRequestException(
        `Column "${columnId}" has ${taskCount} task(s). Provide targetColumnId to migrate them before deleting.`,
      );
    }

    const nextColumns = this.reindexColumns(
      columns.filter(col => col.id !== columnId),
    );

    try {
      const session = await this.connection.startSession();
      try {
        await session.withTransaction(async () => {
          if (taskCount > 0 && targetColumnId) {
            await this.taskModel
              .updateMany(
                { workspaceId: new Types.ObjectId(workspaceId), columnId },
                { $set: { columnId: targetColumnId } },
                { session },
              )
              .exec();
          }

          await this.saveColumnsWithVersion(board, nextColumns, session);
        });
      } finally {
        await session.endSession();
      }
    } catch (error: any) {
      if (
        error.message?.includes('transaction') ||
        error.codeName === 'IllegalOperation' ||
        error.codeName === 'CommandNotSupportedOnStandalone' ||
        error.code === 20
      ) {
        this.logger.warn(
          'MongoDB transaction not supported, falling back to sequential Kanban column delete',
        );

        if (taskCount > 0 && targetColumnId) {
          await this.taskModel
            .updateMany(
              { workspaceId: new Types.ObjectId(workspaceId), columnId },
              { $set: { columnId: targetColumnId } },
            )
            .exec();
        }
        await this.saveColumnsWithVersion(board, nextColumns);
      } else {
        throw error;
      }
    }

    const updated = await this.findById(boardId);

    await this.invalidateBoardCache(workspaceId);
    this.realtimeService.emitBoardDelta(
      workspaceId,
      'column:deleted',
      { boardId, columnId, targetColumnId, migratedTaskCount: taskCount },
      this.getVersion(updated),
    );

    return updated;
  }

  public async moveColumn(
    boardId: string,
    columnId: string,
    dto: MoveColumnDto,
  ): Promise<BoardDocument> {
    const board = await this.findById(boardId);
    const columns = this.toPlainColumns(board.columns);
    const currentIndex = columns.findIndex(c => c.id === columnId);

    if (currentIndex === -1) {
      throw new NotFoundException(
        `Column "${columnId}" not found in board ${boardId}`,
      );
    }

    const [movedColumn] = columns.splice(currentIndex, 1);
    let insertIndex: number;

    if (dto.targetIndex !== undefined) {
      insertIndex = Math.max(0, Math.min(dto.targetIndex, columns.length));
    } else if (dto.afterColumnId !== undefined) {
      if (dto.afterColumnId === null) {
        insertIndex = 0;
      } else {
        const afterIndex = columns.findIndex(c => c.id === dto.afterColumnId);
        if (afterIndex === -1) {
          throw new NotFoundException(
            `After column "${dto.afterColumnId}" not found in board ${boardId}`,
          );
        }
        insertIndex = afterIndex + 1;
      }
    } else {
      throw new BadRequestException(
        'Either targetIndex or afterColumnId must be provided',
      );
    }

    columns.splice(insertIndex, 0, movedColumn);
    const updated = await this.saveColumnsWithVersion(
      board,
      this.reindexColumns(columns),
    );
    const workspaceId = this.toId(updated.workspaceId);

    await this.invalidateBoardCache(workspaceId);
    this.realtimeService.emitBoardDelta(
      workspaceId,
      'column:moved',
      { boardId, columnId, targetIndex: insertIndex },
      this.getVersion(updated),
    );

    return updated;
  }

  private async loadAndCacheBoard(
    workspaceId: string,
    cacheKey: string,
  ): Promise<BoardDocument> {
    const cached =
      await this.cacheManager.get<Record<string, unknown>>(cacheKey);
    if (cached) {
      return this.boardModel.hydrate(cached);
    }

    const board = await this.boardModel
      .findOne({ workspaceId: new Types.ObjectId(workspaceId) })
      .exec();
    const resolved = board ?? (await this.createDefaultBoard(workspaceId));

    await this.cacheBoard(workspaceId, resolved);
    return resolved;
  }

  private async saveColumnsWithVersion(
    board: BoardDocument,
    columns: Array<KanbanBoardColumnDto | BoardColumn>,
    session?: ClientSession,
  ): Promise<BoardDocument> {
    const version = this.getVersion(board);
    const updated = await this.boardModel
      .findOneAndUpdate(
        { _id: board._id, __v: version },
        {
          $set: { columns },
          $inc: { __v: 1 },
        },
        {
          new: true,
          runValidators: true,
          session,
        },
      )
      .exec();

    if (!updated) {
      throw new ConflictException(
        'Board was changed by another request. Refresh and retry.',
      );
    }

    return updated;
  }

  private reindexColumns<T extends KanbanBoardColumnDto | BoardColumn>(
    columns: T[],
  ): T[] {
    return columns.map((column, index) => ({ ...column, order: index }));
  }

  private normalizeAndValidateColumnNames(
    columns: KanbanBoardColumnDto[],
  ): KanbanBoardColumnDto[] {
    const normalizedColumns = columns.map(column => ({
      ...column,
      name: normalizeColumnDisplayName(column.name),
    }));
    const nameKeys = new Set<string>();

    for (const column of normalizedColumns) {
      this.validateColumnName(column.name);
      const nameKey = getColumnNameKey(column.name);

      if (nameKeys.has(nameKey)) {
        throw new ConflictException(ErrorFactory.duplicateColumnName());
      }

      nameKeys.add(nameKey);
    }

    return normalizedColumns;
  }

  private validateColumnName(name: string): void {
    if (isColumnNameEmpty(name)) {
      throw new BadRequestException(ErrorFactory.invalidColumnName());
    }
  }

  private toPlainColumns(columns: BoardColumn[]): KanbanBoardColumnDto[] {
    return columns.map(column => ({
      id: column.id,
      name: column.name,
      order: column.order,
      wipLimit: column.wipLimit,
      mappedStatuses: [...(column.mappedStatuses ?? [])],
    }));
  }

  private getBoardCacheKey(workspaceId: string): string {
    return `kanban:board:${workspaceId}`;
  }

  private async cacheBoard(
    workspaceId: string,
    board: BoardDocument,
  ): Promise<void> {
    await this.cacheManager.set(
      this.getBoardCacheKey(workspaceId),
      board.toObject({ versionKey: true }),
      this.boardCacheTtlMs,
    );
  }

  private async invalidateBoardCache(workspaceId: string): Promise<void> {
    await this.cacheManager.del(this.getBoardCacheKey(workspaceId));
  }

  private toId(value: unknown): string {
    if (value instanceof Types.ObjectId) {
      return value.toString();
    }

    if (typeof value === 'object' && value !== null && '_id' in value) {
      return String(value._id);
    }

    return String(value);
  }

  private getVersion(board: BoardDocument): number {
    return (board as VersionedBoardDocument).__v ?? 0;
  }
}
