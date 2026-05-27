import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Board, BoardDocument, BoardColumn } from '../schemas/kanban-board.schema';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { CreateColumnDto, UpdateColumnDto, MoveColumnDto, KanbanBoardColumnDto } from '../dtos/kanban.dto';
import { randomUUID } from 'crypto';
import { Workspace, WorkspaceDocument } from '@/modules/workspaces/schemas/workspace.schema';

@Injectable()
export class KanbanService {
  private readonly logger = new Logger(KanbanService.name);

  private readonly defaultColumns: KanbanBoardColumnDto[] = [
    { id: 'todo', name: 'To Do', order: 0, mappedStatuses: ['todo'] },
    { id: 'inprogress', name: 'In Progress', order: 1, mappedStatuses: ['in-progress'] },
    { id: 'done', name: 'Done', order: 2, mappedStatuses: ['done'] },
  ];

  constructor(
    @InjectModel(Board.name) private boardModel: Model<BoardDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Workspace.name) private workspaceModel: Model<WorkspaceDocument>,
    @InjectConnection() private connection: Connection,
  ) { }

  // ─── Board-level methods (existing) ────────────────────────

  public async createDefaultBoard(workspaceId: string): Promise<BoardDocument> {
    this.logger.log(`Creating default Kanban board for Workspace: ${workspaceId}`);

    const board = await this.boardModel.findOneAndUpdate(
      { workspaceId: new Types.ObjectId(workspaceId) },
      { $setOnInsert: { workspaceId: new Types.ObjectId(workspaceId), name: 'Main Board', columns: this.defaultColumns, settings: {} } },
      { upsert: true, new: true },
    ).exec();

    return board!;
  }

  public async findOrCreateByWorkspaceKey(workspaceKey: string): Promise<BoardDocument> {
    if (!workspaceKey) {
      throw new BadRequestException('workspaceKey is required');
    }

    const workspace = await this.workspaceModel.findOne({ key: workspaceKey }).exec();
    if (!workspace) {
      throw new NotFoundException(`Workspace with key ${workspaceKey} not found`);
    }

    return this.findOrCreateByWorkspaceId(workspace._id.toString());
  }

  public async findOrCreateByWorkspaceId(workspaceId: string): Promise<BoardDocument> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      throw new BadRequestException('Invalid workspace ID format');
    }

    const board = await this.boardModel
      .findOne({ workspaceId: new Types.ObjectId(workspaceId) })
      .exec();
    if (board) return board;

    return this.createDefaultBoard(workspaceId);
  }

  public async findByWorkspaceKey(workspaceKey: string): Promise<BoardDocument[]> {
    if (!workspaceKey) {
      throw new BadRequestException('workspaceKey is required');
    }

    const workspace = await this.workspaceModel.findOne({ key: workspaceKey }).exec();
    if (!workspace) {
      throw new NotFoundException(`Workspace with key ${workspaceKey} not found`);
    }

    return this.findByWorkspaceId(workspace._id.toString());
  }

  public async findByWorkspaceId(workspaceId: string): Promise<BoardDocument[]> {
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

  public async replaceColumns(id: string, columns: KanbanBoardColumnDto[]): Promise<BoardDocument> {
    const board = await this.boardModel
      .findByIdAndUpdate(id, { columns }, { new: true })
      .exec();

    if (!board) {
      throw new NotFoundException(`Board with id ${id} not found`);
    }

    return board;
  }

  public async deleteByWorkspace(workspaceId: string): Promise<void> {
    this.logger.log(`Deleting all boards for Workspace: ${workspaceId}`);
    await this.boardModel.deleteMany({ workspaceId: new Types.ObjectId(workspaceId) }).exec();
  }

  // ─── Column CRUD methods (new) ─────────────────────────────

  /**
   * Thêm column mới vào cuối board.
   * - id: tự generate UUID
   * - order: tự tính = max(existing orders) + 1
   */
  public async addColumn(boardId: string, dto: CreateColumnDto): Promise<BoardDocument> {
    const board = await this.findById(boardId);

    const maxOrder = board.columns.length > 0
      ? Math.max(...board.columns.map(c => c.order))
      : -1;

    const newColumn = {
      id: randomUUID(),
      name: dto.name,
      order: maxOrder + 1,
      mappedStatuses: [],
    } as BoardColumn;

    board.columns.push(newColumn);
    return board.save();
  }

  /**
   * Cập nhật name và/hoặc mappedStatuses của column.
   */
  public async updateColumn(boardId: string, columnId: string, dto: UpdateColumnDto): Promise<BoardDocument> {
    const board = await this.findById(boardId);
    const column = board.columns.find(c => c.id === columnId);

    if (!column) {
      throw new NotFoundException(`Column "${columnId}" not found in board ${boardId}`);
    }

    if (dto.name !== undefined) {
      column.name = dto.name;
    }
    if (dto.mappedStatuses !== undefined) {
      column.mappedStatuses = dto.mappedStatuses;
    }

    board.markModified('columns');
    return board.save();
  }

  /**
   * Cập nhật wipLimit cho column.
   * Truyền null để xóa giới hạn.
   */
  public async updateWipLimit(boardId: string, columnId: string, wipLimit: number | null | undefined): Promise<BoardDocument> {
    const board = await this.findById(boardId);
    const column = board.columns.find(c => c.id === columnId);

    if (!column) {
      throw new NotFoundException(`Column "${columnId}" not found in board ${boardId}`);
    }

    if (wipLimit === null || wipLimit === undefined) {
      column.wipLimit = undefined;
    } else {
      column.wipLimit = wipLimit;
    }

    board.markModified('columns');
    return board.save();
  }

  /**
   * Xóa column khỏi board.
   * Nếu còn task đang ở column này, bắt buộc phải truyền targetColumnId để migrate .
   * Logic được bọc trong Mongoose transaction (nếu DB hỗ trợ replica set).
   */
  public async deleteColumn(boardId: string, columnId: string, targetColumnId?: string): Promise<BoardDocument> {
    const board = await this.findById(boardId);

    const columnIndex = board.columns.findIndex(c => c.id === columnId);

    if (columnIndex === -1) {
      throw new NotFoundException(`Column "${columnId}" not found in board ${boardId}`);
    }

    // Validate targetColumnId nếu có
    if (targetColumnId) {
      const targetExists = board.columns.some(c => c.id === targetColumnId && c.id !== columnId);
      if (!targetExists) {
        throw new BadRequestException(`Target column "${targetColumnId}" not found in board ${boardId}`);
      }
    }

    // Kiểm tra task đang nằm ở column này (dùng workspaceId thay boardId để bắt tất cả tasks)
    const workspaceId = board.workspaceId;
    const taskCount = await this.taskModel.countDocuments({
      workspaceId,
      columnId: columnId,
    }).exec();

    if (taskCount > 0 && !targetColumnId) {
      throw new BadRequestException(
        `Column "${columnId}" has ${taskCount} task(s). Provide targetColumnId to migrate them before deleting.`,
      );
    }

    // Thực hiện migrate + delete (bọc transaction nếu hỗ trợ)
    try {
      const session = await this.connection.startSession();
      try {
        await session.withTransaction(async () => {
          // Migrate tasks sang target column
          if (taskCount > 0 && targetColumnId) {
            await this.taskModel.updateMany(
              { workspaceId, columnId: columnId },
              { $set: { columnId: targetColumnId } },
              { session },
            ).exec();
            this.logger.log(`Migrated ${taskCount} task(s) from column "${columnId}" to "${targetColumnId}"`);
          }

          // Xóa column khỏi mảng
          board.columns.splice(columnIndex, 1);

          // Reindex order từ 0
          board.columns.forEach((col, idx) => {
            col.order = idx;
          });

          board.markModified('columns');
          await board.save({ session });
        });
      } finally {
        await session.endSession();
      }
    } catch (error: any) {
      // Fallback nếu MongoDB không hỗ trợ transaction (standalone mode)
      if (
        error.message?.includes('transaction') ||
        error.codeName === 'IllegalOperation' ||
        error.codeName === 'CommandNotSupportedOnStandalone' ||
        error.code === 20
      ) {
        this.logger.warn('MongoDB transaction not supported, falling back to sequential operations');

        if (taskCount > 0 && targetColumnId) {
          await this.taskModel.updateMany(
            { workspaceId, columnId: columnId },
            { $set: { columnId: targetColumnId } },
          ).exec();
          this.logger.log(`Migrated ${taskCount} task(s) from column "${columnId}" to "${targetColumnId}"`);
        }

        board.columns.splice(columnIndex, 1);
        board.columns.forEach((col, idx) => {
          col.order = idx;
        });
        board.markModified('columns');
        await board.save();
      } else {
        throw error;
      }
    }

    return this.findById(boardId);
  }

  /**
   * Di chuyển column đến vị trí mới.
   * Hỗ trợ: targetIndex (0-based) hoặc afterColumnId (null = lên đầu).
   * Sau khi move, reindex order từ 0..N-1.
   */
  public async moveColumn(boardId: string, columnId: string, dto: MoveColumnDto): Promise<BoardDocument> {
    const board = await this.findById(boardId);

    // Tìm column cần di chuyển
    const currentIndex = board.columns.findIndex(c => c.id === columnId);
    if (currentIndex === -1) {
      throw new NotFoundException(`Column "${columnId}" not found in board ${boardId}`);
    }

    // Tháo column ra khỏi mảng
    const [movedColumn] = board.columns.splice(currentIndex, 1);

    // Tính toán vị trí chèn
    let insertIndex: number;

    if (dto.targetIndex !== undefined) {
      // đảm bảo insert index nằm trong [0, columns.length]
      insertIndex = Math.max(0, Math.min(dto.targetIndex, board.columns.length));
    } else if (dto.afterColumnId !== undefined) {
      if (dto.afterColumnId === null) {
        // null = chèn lên đầu
        insertIndex = 0;
      } else {
        const afterIndex = board.columns.findIndex(c => c.id === dto.afterColumnId);
        if (afterIndex === -1) {
          throw new NotFoundException(`After column "${dto.afterColumnId}" not found in board ${boardId}`);
        }
        insertIndex = afterIndex + 1;
      }
    } else {
      throw new BadRequestException('Either targetIndex or afterColumnId must be provided');
    }

    // Chèn column vào vị trí mới
    board.columns.splice(insertIndex, 0, movedColumn);

    // Reindex order từ 0..N-1
    board.columns.forEach((col, idx) => {
      col.order = idx;
    });

    board.markModified('columns');
    return board.save();
  }
}

