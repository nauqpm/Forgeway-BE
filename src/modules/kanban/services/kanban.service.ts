import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Board, BoardDocument, BoardColumn } from '../schemas/kanban-board.schema';
import { CreateKanbanBoardDto, KanbanBoardColumnDto } from '../dtos/kanban.dto';

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
  ) {}

  async createDefaultBoard(workspaceId: string): Promise<BoardDocument> {
    this.logger.log(`Creating default Kanban board for Workspace: ${workspaceId}`);
    
    const board = new this.boardModel({
      workspaceId: new Types.ObjectId(workspaceId),
      columns: this.defaultColumns,
    });

    return board.save();
  }

  async findByWorkspace(workspaceId: string): Promise<BoardDocument[]> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      throw new BadRequestException('Invalid Workspace ID format');
    }
    return this.boardModel.find({ workspaceId: new Types.ObjectId(workspaceId) }).exec();
  }

  async findById(id: string): Promise<BoardDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid board ID format');
    }
    const board = await this.boardModel.findById(id).exec();
    if (!board) {
      throw new NotFoundException(`Board with id ${id} not found`);
    }
    return board;
  }

  async updateColumns(id: string, columns: KanbanBoardColumnDto[]): Promise<BoardDocument> {
    const board = await this.boardModel
      .findByIdAndUpdate(id, { columns }, { new: true })
      .exec();

    if (!board) {
      throw new NotFoundException(`Board with id ${id} not found`);
    }

    return board;
  }

  async deleteByWorkspace(workspaceId: string): Promise<void> {
    this.logger.log(`Deleting all boards for Workspace: ${workspaceId}`);
    await this.boardModel.deleteMany({ workspaceId: new Types.ObjectId(workspaceId) }).exec();
  }
}
