// Xử lý trạng thái done của board.
// File này đọc board columns để xác định các status được xem là completed/done.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Board, BoardDocument } from '../../kanban/schemas/kanban-board.schema';

@Injectable()
export class BoardStatusService {
  constructor(
    @InjectModel(Board.name) private readonly boardModel: Model<BoardDocument>,
  ) {}

  async getCompletedStatuses(
    workspaceId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<string[]> {
    const boardQuery = this.boardModel.findOne({ workspaceId }).lean();
    const board = await (
      session ? boardQuery.session(session) : boardQuery
    ).exec();

    const doneColumns =
      board?.columns?.filter((column: any) => {
        const mappedStatuses = column.mappedStatuses ?? [];
        return (
          column.isDone === true ||
          column.id?.toLowerCase?.() === 'done' ||
          mappedStatuses.some(
            (status: string) => status?.toLowerCase?.() === 'done',
          )
        );
      }) ?? [];

    const statuses = doneColumns
      .flatMap((column: any) => column.mappedStatuses ?? [])
      .filter(Boolean);

    return statuses.length > 0 ? statuses : ['done'];
  }
}
