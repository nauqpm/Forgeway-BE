import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { TaskMapper } from '../../tasks/mappers/task.mapper';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { TaskDto } from '../../tasks/dtos/responses/task.dto';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { TaskLabelsUpdatedEvent } from '../../../shared/events/domain-events/task';
import { SetTaskLabelsDto } from '../dtos/set-task-labels.dto';
import { LabelService } from './label.service';

@Injectable()
export class TaskLabelService {
  constructor(
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
    private readonly labelService: LabelService,
    private readonly taskMapper: TaskMapper,
    private readonly taskActivitiesService: TaskActivitiesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async setTaskLabels(
    workspaceId: string,
    taskId: string,
    dto: SetTaskLabelsDto,
    userId: string,
  ): Promise<TaskDto> {
    const task = await this.getWritableTask(workspaceId, taskId, userId);
    const labelIds = [...new Set(dto.labelIds)];

    const labels = await this.labelService.findActiveLabelsByIds(
      workspaceId,
      labelIds,
    );
    if (labels.length !== labelIds.length) {
      throw new BadRequestException(
        'One or more labels do not belong to this workspace',
      );
    }

    const beforeLabelIds = this.toIdList(task.labelIds || []);
    task.labelIds = labelIds.map(labelId => new Types.ObjectId(labelId));
    task.version = (task.version ?? 0) + 1;
    await task.save();

    const updatedTask = await this.taskModel
      .findOne({
        _id: task._id,
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .populate('workspaceId', 'key name type')
      .populate('assigneeId', 'fullName email avatar')
      .populate('reporterId', 'fullName email avatar')
      .populate('archivedBy', 'fullName email avatar')
      .populate('sprintId', 'name startDate endDate')
      .populate('boardId', 'name')
      .populate('labelIds', 'name')
      .exec();

    if (!updatedTask) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    await this.taskActivitiesService.recordTaskLabelsChanged(
      updatedTask,
      userId,
      beforeLabelIds,
      labelIds,
    );

    const taskDto = this.taskMapper.mapToDto(updatedTask);
    this.publishLabelsUpdatedEvent(updatedTask, userId, labelIds, taskDto);

    return taskDto;
  }

  private publishLabelsUpdatedEvent(
    task: TaskDocument,
    actorId: string,
    labelIds: string[],
    taskDto: TaskDto,
  ): void {
    const event = new TaskLabelsUpdatedEvent({
      workspaceId: this.toId(task.workspaceId),
      taskId: task._id.toString(),
      taskKey: task.key,
      actorId,
      version: task.version,
      labelIds,
      task: taskDto,
    });

    this.eventEmitter.emit(event.type, event);
  }
  private async getWritableTask(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<TaskDocument> {
    this.validateObjectId(workspaceId, 'Workspace');
    this.validateObjectId(taskId, 'Task');
    await this.workspacesService.findById(workspaceId);
    await this.assertWorkspaceMember(workspaceId, userId);

    const task = await this.taskModel
      .findOne({
        _id: new Types.ObjectId(taskId),
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    if (task.isArchived) {
      throw new BadRequestException('Archived task labels are read-only');
    }

    return task;
  }

  private async assertWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const isMember = await this.workspaceMemberService.isMember(
      workspaceId,
      userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Workspace access denied');
    }
  }

  private toId(value: any): string {
    return value?._id?.toString?.() ?? value?.toString?.() ?? '';
  }

  private toIdList(values: unknown[]): string[] {
    return values.map((value: any) =>
      value?._id ? value._id.toString() : value.toString(),
    );
  }

  private validateObjectId(value: string, label: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(
        `${label} must be a valid MongoDB ObjectId`,
      );
    }
  }
}
