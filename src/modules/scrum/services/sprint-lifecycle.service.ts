// Xử lý vòng đời sprint: start sprint và complete sprint.
// File này kiểm tra trạng thái sprint, kiểm tra active sprint hiện tại,
// validate target sprint khi đóng sprint, move incomplete tasks.
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { CompleteSprintDto, StartSprintDto } from '../dtos/sprint.dto';
import { Sprint, SprintDocument } from '../schemas/sprint.schema';
import { BoardStatusService } from './board-status.service';
import { MongoTransactionService } from './mongo-transaction.service';

@Injectable()
export class SprintLifecycleService {
  private readonly logger = new Logger(SprintLifecycleService.name);

  constructor(
    private readonly mongoTransactionService: MongoTransactionService,
    private readonly boardStatusService: BoardStatusService,
    @InjectModel(Sprint.name) private readonly sprintModel: Model<SprintDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
  ) {}

  async startSprint(
    workspaceId: string,
    sprintId: string,
    dto: StartSprintDto,
  ): Promise<SprintDocument> {
    this.logger.log(`Bắt đầu một sprint: ${sprintId} cho workspace: ${workspaceId}`);

    return this.mongoTransactionService.withTransaction(async (session) => {
      const workspaceObjectId = new Types.ObjectId(workspaceId);
      const sprintObjectId = new Types.ObjectId(sprintId);

      const sprint = await this.mongoTransactionService
        .withSession(
          this.sprintModel.findOne({
            _id: sprintObjectId,
            workspaceId: workspaceObjectId,
            deletedAt: null,
          }),
          session,
        )
        .exec();

      if (!sprint) {
        throw new NotFoundException('Sprint không tồn tại');
      }

      if (sprint.status !== 'planning') {
        throw new BadRequestException('Chỉ có thể kích hoạt sprint đang ở trạng thái lên kế hoạch');
      }

      const activeSprint = await this.mongoTransactionService
        .withSession(
          this.sprintModel.findOne({
            workspaceId: workspaceObjectId,
            status: 'active',
            _id: { $ne: sprintObjectId },
            deletedAt: null,
          }),
          session,
        )
        .exec();

      if (activeSprint) {
        throw new BadRequestException(
          'Không thể kích hoạt sprint: Đã có một sprint đang hoạt động trong workspace này.',
        );
      }

      sprint.status = 'active';
      sprint.startDate = new Date(dto.startDate);
      sprint.endDate = new Date(dto.endDate);
      sprint.startedAt = new Date();

      return sprint.save({ session: session ?? undefined });
    });
  }

  async completeSprint(
    workspaceId: string,
    sprintId: string,
    dto: CompleteSprintDto,
  ): Promise<any> {
    this.logger.log(`Hoàn thành sprint: ${sprintId} cho workspace: ${workspaceId}`);

    return this.mongoTransactionService.withTransaction(async (session) => {
      const workspaceObjectId = new Types.ObjectId(workspaceId);
      const sprintObjectId = new Types.ObjectId(sprintId);
      const moveToSprintObjectId = dto.moveToSprintId
        ? new Types.ObjectId(dto.moveToSprintId)
        : null;

      const sprint = await this.mongoTransactionService
        .withSession(
            this.sprintModel.findOne({
              _id: sprintObjectId,
              workspaceId: workspaceObjectId,
              deletedAt: null,
            }),
          session,
        )
        .exec();

      if (!sprint) {
        throw new NotFoundException('Sprint không tồn tại');
      }

      if (sprint.status !== 'active') {
        throw new BadRequestException('Chỉ có thể hoàn thành sprint đang ở trạng thái hoạt động');
      }

      if (moveToSprintObjectId) {
        const targetSprint = await this.mongoTransactionService
          .withSession(
            this.sprintModel.findOne({
              _id: moveToSprintObjectId,
              workspaceId: workspaceObjectId,
              status: 'planning',
              deletedAt: null,
            }),
            session,
          )
          .exec();

        if (!targetSprint) {
          throw new BadRequestException(
            'moveToSprintId không hợp lệ: Sprint đích phải tồn tại, thuộc cùng workspace và đang ở trạng thái lên kế hoạch',
          );
        }
      }

      const completedStatuses = await this.boardStatusService.getCompletedStatuses(
        workspaceObjectId,
        session ?? undefined,
      );

      const updateFields: any = { sprintId: moveToSprintObjectId };
      if (!moveToSprintObjectId) {
        updateFields.columnId = 'todo';
        updateFields.status = 'todo';
      }

      await this.taskModel
        .updateMany(
          {
            workspaceId: workspaceObjectId,
            sprintId: sprintObjectId,
            isDeleted: { $ne: true },
            status: { $nin: completedStatuses },
          },
          { $set: updateFields },
          { session: session ?? undefined },
        )
        .exec();

      sprint.status = 'completed';
      sprint.completedAt = new Date();
      const savedSprint = await sprint.save({ session: session ?? undefined });

      return {
        _id: savedSprint._id,
        workspaceId: savedSprint.workspaceId,
        name: savedSprint.name,
        status: savedSprint.status,
        completedAt: savedSprint.completedAt,
        incompleteTasksMovedTo: moveToSprintObjectId,
      };
    });
  }
}
