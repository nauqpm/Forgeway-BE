import { Injectable } from '@nestjs/common';
import { TaskDocument } from '../schemas/task.schema';
import { TaskDto, TaskUserSummaryDto } from '../dtos/responses/task.dto';
import {
  BoardSummaryDto,
  SprintSummaryDto,
  TaskDetailDto,
} from '../dtos/responses/task-detail.dto';

@Injectable()
export class TaskMapper {
  mapToDto(task: TaskDocument | any): TaskDto {
    if (!task) {
      return task;
    }

    const plainTask =
      typeof task.toObject === 'function' ? task.toObject() : task;

    return {
      id: this.toId(plainTask._id || plainTask.id),
      workspaceId: this.toId(plainTask.workspaceId),
      sprintId: this.toOptionalId(plainTask.sprintId),
      boardId: this.toOptionalId(plainTask.boardId),
      columnId: plainTask.columnId,
      key: plainTask.key,
      title: plainTask.title,
      description: plainTask.description || '',
      type: plainTask.type,
      status: plainTask.status || plainTask.columnId || 'todo',
      priority: plainTask.priority,
      rank: plainTask.rank,
      cover: this.mapCover(plainTask.cover),
      assigneeId: this.toOptionalId(plainTask.assigneeId),
      labels: this.mapLabelSummaries(plainTask.labelIds),
      reporterId: this.toId(plainTask.reporterId),
      storyPoints: plainTask.storyPoints,
      startDate: plainTask.startDate,
      dueDate: plainTask.dueDate,
      epicId: this.toOptionalId(plainTask.epicId),
      isArchived: plainTask.isArchived || false,
      archivedAt: plainTask.archivedAt,
      archivedBy: this.toOptionalId(plainTask.archivedBy),
      archivedByUser: this.mapUserSummary(plainTask.archivedBy),
      isDeleted: plainTask.isDeleted || false,
      deletedAt: plainTask.deletedAt,
      deletedBy: this.toOptionalId(plainTask.deletedBy),
      createdAt: plainTask.createdAt,
      updatedAt: plainTask.updatedAt,
    };
  }

  mapToDtos(tasks: Array<TaskDocument | any>): TaskDto[] {
    return tasks.map((task) => this.mapToDto(task));
  }

  mapToDetailDto(task: TaskDocument | any): TaskDetailDto {
    const plainTask =
      typeof task?.toObject === 'function' ? task.toObject() : task;

    return {
      id: this.toId(plainTask._id || plainTask.id),
      workspaceId: this.toId(plainTask.workspaceId),
      key: plainTask.key,
      title: plainTask.title,
      description: plainTask.description || '',
      type: plainTask.type,
      priority: plainTask.priority,
      status: plainTask.status || plainTask.columnId || 'todo',
      columnId: plainTask.columnId,
      rank: plainTask.rank,
      cover: this.mapCover(plainTask.cover),
      sprintId: this.toOptionalId(plainTask.sprintId),
      sprint: this.mapSprintSummary(plainTask.sprintId),
      boardId: this.toOptionalId(plainTask.boardId),
      board: this.mapBoardSummary(plainTask.boardId),
      assigneeId: this.toOptionalId(plainTask.assigneeId),
      labels: this.mapLabelSummaries(plainTask.labelIds),
      assignee: this.mapUserSummary(plainTask.assigneeId),
      reporterId: this.toId(plainTask.reporterId),
      reporter: this.mapUserSummary(plainTask.reporterId),
      archivedBy: this.toOptionalId(plainTask.archivedBy),
      archivedByUser: this.mapUserSummary(plainTask.archivedBy),
      storyPoints: plainTask.storyPoints,
      dueDate: plainTask.dueDate,
      isArchived: plainTask.isArchived || false,
      archivedAt: plainTask.archivedAt,
      isDeleted: plainTask.isDeleted || false,
      createdAt: plainTask.createdAt,
      updatedAt: plainTask.updatedAt,
    };
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

  private toOptionalId(value: any): string | undefined {
    if (!value) {
      return undefined;
    }
    return this.toId(value);
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

  private mapCover(value: any) {
    if (!value) {
      return undefined;
    }

    return {
      type: value.type,
      color: value.color,
      imageUrl: value.imageUrl,
      source: value.source,
      updatedBy: this.toOptionalId(value.updatedBy),
      updatedAt: value.updatedAt,
    };
  }
  private mapLabelSummaries(
    values: any,
  ): Array<{ id: string; name: string }> | undefined {
    if (!Array.isArray(values) || values.length === 0) {
      return undefined;
    }

    return values
      .filter((value) => value && value._id)
      .map((value) => ({
        id: this.toId(value),
        name: value.name,
      }));
  }
  private mapSprintSummary(value: any): SprintSummaryDto | undefined {
    if (!value || !value._id) {
      return undefined;
    }

    return {
      id: this.toId(value),
      name: value.name,
      startDate: value.startDate,
      endDate: value.endDate,
    };
  }

  private mapBoardSummary(value: any): BoardSummaryDto | undefined {
    if (!value || !value._id) {
      return undefined;
    }

    return {
      id: this.toId(value),
      name: value.name,
    };
  }
}
