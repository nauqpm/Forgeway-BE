import { Injectable } from '@nestjs/common';
import { TaskDocument } from '../schemas/task.schema';
import { TaskDto } from '../dtos/responses/task.dto';

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
      assigneeId: this.toOptionalId(plainTask.assigneeId),
      reporterId: this.toId(plainTask.reporterId),
      storyPoints: plainTask.storyPoints,
      dueDate: plainTask.dueDate,
      createdAt: plainTask.createdAt,
      updatedAt: plainTask.updatedAt,
    };
  }

  mapToDtos(tasks: Array<TaskDocument | any>): TaskDto[] {
    return tasks.map((task) => this.mapToDto(task));
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
}
