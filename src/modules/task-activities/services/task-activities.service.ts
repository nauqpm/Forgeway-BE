import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { TaskActivityCreatedEvent } from '../../../shared/events/domain-events/task';
import {
  TASK_ACTIVITY_TYPES,
  TaskActivityType,
} from '../constants/task-activity.constants';
import { FilterTaskActivityDto } from '../dtos/filter-task-activity.dto';
import { TaskActivityListDto } from '../dtos/task-activity-list.dto';
import { TaskActivityMapper } from '../mappers/task-activity.mapper';
import {
  CreateTaskActivityData,
  TaskActivitiesRepository,
} from '../repositories/task-activities.repository';

interface TaskActivityRecordInput {
  workspaceId: string;
  taskId: string;
  taskKey: string;
  actorId: string;
  type: TaskActivityType;
  metadata?: Record<string, unknown>;
}

interface TaskSnapshot {
  id: string;
  workspaceId: string;
  key: string;
  title?: string;
  description?: string;
  type?: string;
  priority?: string;
  status?: string;
  columnId?: string;
  sprintId?: string;
  assigneeId?: string;
  storyPoints?: number;
  dueDate?: string;
  rank?: string;
}

@Injectable()
export class TaskActivitiesService {
  private readonly logger = new Logger(TaskActivitiesService.name);

  constructor(
    private readonly taskActivitiesRepository: TaskActivitiesRepository,
    private readonly taskActivityMapper: TaskActivityMapper,
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findByTaskInWorkspaceKey(
    workspaceKey: string,
    taskId: string,
    userId: string,
    filterDto: FilterTaskActivityDto = {},
  ): Promise<TaskActivityListDto> {
    const workspace = await this.workspacesService.findById(workspaceKey);
    const workspaceId = workspace._id.toString();
    await this.assertWorkspaceMember(workspaceId, userId);

    const task = await this.findTaskInWorkspace(workspaceId, taskId);
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const result = await this.taskActivitiesRepository.findByTaskInWorkspace(
      workspaceId,
      taskId,
      filterDto,
    );

    return {
      activities: this.taskActivityMapper.mapToDtos(result.activities),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async recordCommentUpdated(
    task: unknown,
    actorId: string,
    commentId: string,
  ): Promise<void> {
    const snapshot = this.createSnapshot(task);
    if (!snapshot) {
      return;
    }

    await this.recordSafely({
      workspaceId: snapshot.workspaceId,
      taskId: snapshot.id,
      taskKey: snapshot.key,
      actorId,
      type: TASK_ACTIVITY_TYPES.COMMENT_UPDATED,
      metadata: { commentId },
    });
  }

  async recordCommentDeleted(
    task: unknown,
    actorId: string,
    commentId: string,
  ): Promise<void> {
    const snapshot = this.createSnapshot(task);
    if (!snapshot) {
      return;
    }

    await this.recordSafely({
      workspaceId: snapshot.workspaceId,
      taskId: snapshot.id,
      taskKey: snapshot.key,
      actorId,
      type: TASK_ACTIVITY_TYPES.COMMENT_DELETED,
      metadata: { commentId },
    });
  }
  async recordCommentAdded(
    task: unknown,
    actorId: string,
    commentId: string,
  ): Promise<void> {
    const snapshot = this.createSnapshot(task);
    if (!snapshot) {
      return;
    }

    await this.recordSafely({
      workspaceId: snapshot.workspaceId,
      taskId: snapshot.id,
      taskKey: snapshot.key,
      actorId,
      type: TASK_ACTIVITY_TYPES.COMMENT_ADDED,
      metadata: { commentId },
    });
  }
  async recordAttachmentDeleted(
    task: unknown,
    actorId: string,
    attachmentId: string,
    fileName?: string,
  ): Promise<void> {
    const snapshot = this.createSnapshot(task);
    if (!snapshot) {
      return;
    }

    await this.recordSafely({
      workspaceId: snapshot.workspaceId,
      taskId: snapshot.id,
      taskKey: snapshot.key,
      actorId,
      type: TASK_ACTIVITY_TYPES.ATTACHMENT_DELETED,
      metadata: { attachmentId, fileName },
    });
  }
  async recordAttachmentAdded(
    task: unknown,
    actorId: string,
    attachmentId: string,
    fileName?: string,
  ): Promise<void> {
    const snapshot = this.createSnapshot(task);
    if (!snapshot) {
      return;
    }

    await this.recordSafely({
      workspaceId: snapshot.workspaceId,
      taskId: snapshot.id,
      taskKey: snapshot.key,
      actorId,
      type: TASK_ACTIVITY_TYPES.ATTACHMENT_ADDED,
      metadata: { attachmentId, fileName },
    });
  }
  async recordTaskCoverChanged(
    task: unknown,
    actorId: string,
    action: 'set' | 'remove',
    fromType?: string | null,
    toType?: string | null,
  ): Promise<void> {
    const snapshot = this.createSnapshot(task);
    if (!snapshot) {
      return;
    }

    await this.recordSafely({
      workspaceId: snapshot.workspaceId,
      taskId: snapshot.id,
      taskKey: snapshot.key,
      actorId,
      type: TASK_ACTIVITY_TYPES.COVER_CHANGED,
      metadata: {
        field: 'cover',
        action,
        fromType: fromType ?? null,
        toType: toType ?? null,
      },
    });
  }
  async recordTaskLabelsChanged(
    task: unknown,
    actorId: string,
    fromLabelIds: string[],
    toLabelIds: string[],
  ): Promise<void> {
    const snapshot = this.createSnapshot(task);
    if (!snapshot) {
      return;
    }

    const from = [...fromLabelIds].sort();
    const to = [...toLabelIds].sort();
    if (JSON.stringify(from) === JSON.stringify(to)) {
      return;
    }

    await this.recordSafely({
      workspaceId: snapshot.workspaceId,
      taskId: snapshot.id,
      taskKey: snapshot.key,
      actorId,
      type: TASK_ACTIVITY_TYPES.LABELS_CHANGED,
      metadata: { field: 'labelIds', from, to },
    });
  }
  async recordTaskCreated(task: unknown, actorId: string): Promise<void> {
    const snapshot = this.createSnapshot(task);
    if (!snapshot) {
      return;
    }

    await this.recordSafely({
      workspaceId: snapshot.workspaceId,
      taskId: snapshot.id,
      taskKey: snapshot.key,
      actorId,
      type: TASK_ACTIVITY_TYPES.TASK_CREATED,
      metadata: {
        type: snapshot.type,
        priority: snapshot.priority,
        status: snapshot.status,
        columnId: snapshot.columnId,
        sprintId: snapshot.sprintId ?? null,
        assigneeId: snapshot.assigneeId ?? null,
      },
    });
  }

  async recordTaskUpdated(
    beforeTask: unknown,
    afterTask: unknown,
    actorId: string,
  ): Promise<void> {
    const before = this.createSnapshot(beforeTask);
    const after = this.createSnapshot(afterTask);
    if (!before || !after) {
      return;
    }

    const changes: Array<{
      field: keyof TaskSnapshot;
      type: TaskActivityType;
      sensitive?: boolean;
    }> = [
      { field: 'title', type: TASK_ACTIVITY_TYPES.TITLE_CHANGED },
      {
        field: 'description',
        type: TASK_ACTIVITY_TYPES.DESCRIPTION_CHANGED,
        sensitive: true,
      },
      { field: 'type', type: TASK_ACTIVITY_TYPES.TYPE_CHANGED },
      { field: 'priority', type: TASK_ACTIVITY_TYPES.PRIORITY_CHANGED },
      { field: 'assigneeId', type: TASK_ACTIVITY_TYPES.ASSIGNEE_CHANGED },
      { field: 'storyPoints', type: TASK_ACTIVITY_TYPES.STORY_POINTS_CHANGED },
      { field: 'dueDate', type: TASK_ACTIVITY_TYPES.DUE_DATE_CHANGED },
    ];

    await Promise.all(
      changes.map(({ field, type, sensitive }) =>
        this.recordFieldChange(before, after, actorId, field, type, sensitive),
      ),
    );
  }

  async recordTaskMoved(
    beforeTask: unknown,
    afterTask: unknown,
    actorId: string,
  ): Promise<void> {
    const before = this.createSnapshot(beforeTask);
    const after = this.createSnapshot(afterTask);
    if (!before || !after) {
      return;
    }

    await Promise.all([
      this.recordFieldChange(
        before,
        after,
        actorId,
        'columnId',
        TASK_ACTIVITY_TYPES.COLUMN_CHANGED,
      ),
      this.recordFieldChange(
        before,
        after,
        actorId,
        'status',
        TASK_ACTIVITY_TYPES.STATUS_CHANGED,
      ),
      this.recordFieldChange(
        before,
        after,
        actorId,
        'sprintId',
        TASK_ACTIVITY_TYPES.SPRINT_CHANGED,
      ),
      this.recordFieldChange(
        before,
        after,
        actorId,
        'rank',
        TASK_ACTIVITY_TYPES.RANK_CHANGED,
      ),
    ]);
  }

  async recordTaskArchived(task: unknown, actorId: string): Promise<void> {
    await this.recordLifecycleActivity(
      task,
      actorId,
      TASK_ACTIVITY_TYPES.TASK_ARCHIVED,
    );
  }

  async recordTaskRestored(task: unknown, actorId: string): Promise<void> {
    await this.recordLifecycleActivity(
      task,
      actorId,
      TASK_ACTIVITY_TYPES.TASK_RESTORED,
    );
  }

  /**
   * Ghi nhận sự kiện Log Work vào lịch sử task.
   *
   * @param task          - Task document sau khi cập nhật (chứa timeLogged mới nhất)
   * @param actorId       - ID người dùng thực hiện log
   * @param hoursSpent    - Số giờ log trong lần này
   * @param timeEstimated - Thời gian ước lượng còn lại (giờ)
   */
  async recordWorkLogged(
    task: unknown,
    actorId: string,
    hoursSpent: number,
    timeEstimated?: number,
  ): Promise<void> {
    const snapshot = this.createSnapshot(task);
    if (!snapshot) {
      return;
    }

    const plain =
      typeof (task as { toObject?: () => unknown }).toObject === 'function'
        ? ((task as { toObject: () => unknown }).toObject() as Record<
            string,
            unknown
          >)
        : (task as Record<string, unknown>);

    await this.recordSafely({
      workspaceId: snapshot.workspaceId,
      taskId: snapshot.id,
      taskKey: snapshot.key,
      actorId,
      type: TASK_ACTIVITY_TYPES.WORK_LOGGED,
      metadata: {
        hoursSpent,
        totalLogged:
          typeof plain.timeLogged === 'number' ? plain.timeLogged : 0,
        timeEstimated: timeEstimated ?? null,
      },
    });
  }

  async recordTaskPermanentlyDeleted(
    task: unknown,
    actorId: string,
  ): Promise<void> {
    await this.recordLifecycleActivity(
      task,
      actorId,
      TASK_ACTIVITY_TYPES.TASK_PERMANENTLY_DELETED,
    );
  }

  private async recordFieldChange(
    before: TaskSnapshot,
    after: TaskSnapshot,
    actorId: string,
    field: keyof TaskSnapshot,
    type: TaskActivityType,
    sensitive = false,
  ): Promise<void> {
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (from === to) {
      return;
    }

    await this.recordSafely({
      workspaceId: after.workspaceId,
      taskId: after.id,
      taskKey: after.key,
      actorId,
      type,
      metadata: sensitive ? { field, changed: true } : { field, from, to },
    });
  }

  private async recordLifecycleActivity(
    task: unknown,
    actorId: string,
    type: TaskActivityType,
  ): Promise<void> {
    const snapshot = this.createSnapshot(task);
    if (!snapshot) {
      return;
    }

    await this.recordSafely({
      workspaceId: snapshot.workspaceId,
      taskId: snapshot.id,
      taskKey: snapshot.key,
      actorId,
      type,
      metadata: {},
    });
  }

  private async recordSafely(input: TaskActivityRecordInput): Promise<void> {
    try {
      await this.record(input);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to record task activity ${input.type} for ${input.taskKey}: ${reason}`,
      );
    }
  }

  private async record(input: TaskActivityRecordInput): Promise<void> {
    if (
      !Types.ObjectId.isValid(input.workspaceId) ||
      !Types.ObjectId.isValid(input.taskId) ||
      !Types.ObjectId.isValid(input.actorId)
    ) {
      return;
    }

    const data: CreateTaskActivityData = {
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      taskKey: input.taskKey,
      actorId: input.actorId,
      type: input.type,
      metadata: input.metadata || {},
    };

    const activity = await this.taskActivitiesRepository.create(data);
    this.publishActivityCreatedEvent(activity);
  }

  private publishActivityCreatedEvent(activity: any): void {
    const activityDto = this.taskActivityMapper.mapToDto(activity);
    const event = new TaskActivityCreatedEvent({
      workspaceId: activityDto.workspaceId,
      taskId: activityDto.taskId,
      taskKey: activityDto.taskKey,
      actorId: activityDto.actorId,
      activityId: activityDto.id,
      activity: activityDto,
    });

    this.eventEmitter.emit(event.type, event);
  }
  private createSnapshot(task: unknown): TaskSnapshot | undefined {
    if (!task) {
      return undefined;
    }

    const value =
      typeof (task as { toObject?: () => unknown }).toObject === 'function'
        ? (task as { toObject: () => unknown }).toObject()
        : task;
    const plain = value as Record<string, unknown>;
    const id = this.toId(plain._id || plain.id);
    const workspaceId = this.toId(plain.workspaceId);
    const key = String(plain.key || '');

    if (!id || !workspaceId || !key) {
      return undefined;
    }

    return {
      id,
      workspaceId,
      key,
      title: this.toOptionalString(plain.title),
      description: this.toOptionalString(plain.description),
      type: this.toOptionalString(plain.type),
      priority: this.toOptionalString(plain.priority),
      status: this.toOptionalString(plain.status),
      columnId: this.toOptionalString(plain.columnId),
      sprintId: this.toOptionalId(plain.sprintId),
      assigneeId: this.toOptionalId(plain.assigneeId),
      storyPoints:
        typeof plain.storyPoints === 'number' ? plain.storyPoints : undefined,
      dueDate: this.toOptionalDateString(plain.dueDate),
      rank: this.toOptionalString(plain.rank),
    };
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
      throw new NotFoundException(`Task not found`);
    }
  }

  private async findTaskInWorkspace(
    workspaceId: string,
    taskId: string,
  ): Promise<TaskDocument | null> {
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(taskId)
    ) {
      return null;
    }

    return this.taskModel
      .findOne({
        _id: new Types.ObjectId(taskId),
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .exec();
  }

  private toId(value: unknown): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'object' && '_id' in value) {
      return String(value._id);
    }
    return String(value);
  }

  private toOptionalId(value: unknown): string | undefined {
    const id = this.toId(value);
    return id || undefined;
  }

  private toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private toOptionalDateString(value: unknown): string | undefined {
    if (!value) {
      return undefined;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return String(value);
  }
}
