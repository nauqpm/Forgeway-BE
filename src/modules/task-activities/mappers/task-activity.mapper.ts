import { Injectable } from '@nestjs/common';
import { TaskUserSummaryDto } from '../../tasks/dtos/responses/task.dto';
import { TaskActivityDto } from '../dtos/task-activity.dto';
import { TaskActivityDocument } from '../schemas/task-activity.schema';

@Injectable()
export class TaskActivityMapper {
  mapToDto(activity: TaskActivityDocument | any): TaskActivityDto {
    const plainActivity =
      typeof activity?.toObject === 'function' ? activity.toObject() : activity;

    return {
      id: this.toId(plainActivity._id || plainActivity.id),
      workspaceId: this.toId(plainActivity.workspaceId),
      taskId: this.toId(plainActivity.taskId),
      taskKey: plainActivity.taskKey,
      actorId: this.toId(plainActivity.actorId),
      actor: this.mapUserSummary(plainActivity.actorId),
      type: plainActivity.type,
      metadata: plainActivity.metadata || {},
      createdAt: plainActivity.createdAt,
    };
  }

  mapToDtos(activities: Array<TaskActivityDocument | any>): TaskActivityDto[] {
    return activities.map(activity => this.mapToDto(activity));
  }

  private toId(value: any): string {
    if (!value) {
      return '';
    }
    if (value._id) {
      return value._id.toString();
    }
    return value.toString();
  }

  private mapUserSummary(value: any): TaskUserSummaryDto | undefined {
    if (!value || !value._id) {
      return undefined;
    }

    return {
      id: this.toId(value),
      fullName: value.fullName,
      email: value.email,
      avatar: value.avatar,
    };
  }
}
