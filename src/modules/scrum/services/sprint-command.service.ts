// Xử lý các thao tác thay đổi dữ liệu sprint:
// - tạo sprint
// - cập nhật sprint
// - xóa sprint
// - xóa sprint theo workspace.
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { CreateSprintDto, UpdateSprintDto } from '../dtos/sprint.dto';
import { Sprint, SprintDocument } from '../schemas/sprint.schema';
import { MongoTransactionService } from './mongo-transaction.service';

@Injectable()
export class SprintCommandService {
  private readonly logger = new Logger(SprintCommandService.name);

  constructor(
    private readonly mongoTransactionService: MongoTransactionService,
    @InjectModel(Sprint.name) private readonly sprintModel: Model<SprintDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
  ) {}

  async createSprint(
    workspaceId: string,
    dto: CreateSprintDto,
  ): Promise<SprintDocument> {
    this.logger.log(`Tạo sprint cho Workspace: ${workspaceId}`);

    const workspaceObjectId = new Types.ObjectId(workspaceId);
    const count = await this.sprintModel
      .countDocuments({
        workspaceId: workspaceObjectId,
        deletedAt: null,
      })
      .exec();

    const sprint = new this.sprintModel({
      ...dto,
      workspaceId: workspaceObjectId,
      name: dto.name?.trim() || `Sprint ${count + 1}`,
      status: 'planning',
    });

    return sprint.save();
  }

  async updateSprint(
    workspaceId: string,
    sprintId: string,
    dto: UpdateSprintDto,
  ): Promise<SprintDocument> {
    const timestamp = new Date().toISOString();

    try {
      const sprint = await this.sprintModel
        .findOne({
          _id: new Types.ObjectId(sprintId),
          workspaceId: new Types.ObjectId(workspaceId),
          deletedAt: null,
        })
        .exec();

      if (!sprint) {
        this.logger.error(
          `[AUDIT LOG] [${timestamp}] Cập nhật sprint thất bại | Sprint ID: ${sprintId} | Lỗi: Sprint không tồn tại`,
        );
        throw new NotFoundException('Sprint không tồn tại');
      }

      if (sprint.status === 'completed') {
        this.logger.error(
          `[AUDIT LOG] [${timestamp}] Cập nhật sprint thất bại | Sprint ID: ${sprintId} | Lỗi: Không thể chỉnh sửa sprint đã hoàn thành`,
        );
        throw new BadRequestException('Không thể chỉnh sửa sprint đã hoàn thành');
      }

      if (
        sprint.status !== 'planning' &&
        (dto.startDate !== undefined || dto.endDate !== undefined)
      ) {
        this.logger.error(
          `[AUDIT LOG] [${timestamp}] Cập nhật sprint thất bại | Sprint ID: ${sprintId} | Lỗi: Không thể thay đổi ngày của sprint khi sprint đang hoạt động hoặc hoàn thành`,
        );
        throw new BadRequestException(
          'Không thể thay đổi ngày của sprint khi sprint đang hoạt động hoặc hoàn thành',
        );
      }

      const oldValues = {
        name: sprint.name,
        goal: sprint.goal,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        duration: sprint.duration,
      };

      if (dto.name !== undefined) sprint.name = dto.name;
      if (dto.goal !== undefined) sprint.goal = dto.goal;
      if (dto.duration !== undefined) sprint.duration = dto.duration;

      let nextStartDate = sprint.startDate;
      let nextEndDate = sprint.endDate;

      if (sprint.status === 'planning') {
        if (dto.startDate !== undefined) nextStartDate = new Date(dto.startDate);
        if (dto.endDate !== undefined) nextEndDate = new Date(dto.endDate);
      }

      if (
        nextStartDate &&
        nextEndDate &&
        new Date(nextEndDate).getTime() <= new Date(nextStartDate).getTime()
      ) {
        throw new BadRequestException('Ngày kết thúc phải lớn hơn ngày bắt đầu');
      }

      if (sprint.status === 'planning') {
        sprint.startDate = nextStartDate;
        sprint.endDate = nextEndDate;
      }

      const updatedSprint = await sprint.save();

      const newValues = {
        name: updatedSprint.name,
        goal: updatedSprint.goal,
        startDate: updatedSprint.startDate,
        endDate: updatedSprint.endDate,
        duration: updatedSprint.duration,
      };

      this.logger.log(
        `\n================= AUDIT LOG =================\n` +
          `Action: Sprint Update\n` +
          `Status: SUCCESS\n` +
          `Timestamp: ${timestamp}\n` +
          `Sprint ID: ${sprintId}\n` +
          `Workspace ID: ${workspaceId}\n` +
          `Old Values: ${JSON.stringify(oldValues, null, 2)}\n` +
          `Updated Values: ${JSON.stringify(newValues, null, 2)}\n` +
          `=============================================\n`,
      );

      return updatedSprint;
    } catch (error) {
      if (
        !(error instanceof NotFoundException) &&
        !(error instanceof BadRequestException)
      ) {
        this.logger.error(
          `[AUDIT LOG] [${timestamp}] Cập nhật sprint thất bại | Sprint ID: ${sprintId} | Lỗi: ${error}`,
        );
      }
      throw error;
    }
  }

  async deleteSprint(workspaceId: string, sprintId: string): Promise<void> {
    await this.mongoTransactionService.withTransaction(async (session) => {
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
        throw new BadRequestException('Chỉ có thể xóa sprint đang ở trạng thái lên kế hoạch');
      }

      await this.taskModel
        .updateMany(
          {
            workspaceId: workspaceObjectId,
            sprintId: sprint._id,
          },
          {
            $set: {
              sprintId: null,
              columnId: 'todo',
              status: 'todo',
            },
          },
          { session: session ?? undefined },
        )
        .exec();

      await this.sprintModel
        .deleteOne({ _id: sprint._id }, { session: session ?? undefined })
        .exec();
    });
  }

  async deleteByWorkspace(workspaceId: string): Promise<void> {
    this.logger.log(`Xóa tất cả sprint cho Workspace: ${workspaceId}`);
    await this.sprintModel
      .updateMany(
        {
          workspaceId: new Types.ObjectId(workspaceId),
          deletedAt: null,
        },
        { $set: { deletedAt: new Date() } },
      )
      .exec();
  }

  async restoreByWorkspace(workspaceId: string): Promise<void> {
    this.logger.log(`Khôi phục tất cả sprint cho Workspace: ${workspaceId}`);
    await this.sprintModel
      .updateMany(
        {
          workspaceId: new Types.ObjectId(workspaceId),
          deletedAt: { $ne: null },
        },
        { $set: { deletedAt: null } },
      )
      .exec();
  }
}
