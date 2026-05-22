import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  CreateTaskDto,
  UpdateTaskDto,
} from '../dtos/requests/create-task.dto';
import { Task } from '../schemas/task.schema';

@Injectable()
export class TaskDataTransformerService {
  transformCreateInput(
    dto: CreateTaskDto,
    workspaceId: string,
    userId: string,
    key: string,
  ): Partial<Task> {
    return {
      title: dto.title,
      description: dto.description,
      workspaceId: new Types.ObjectId(workspaceId),
      sprintId: dto.sprintId ? new Types.ObjectId(dto.sprintId) : undefined,
      boardId: dto.boardId ? new Types.ObjectId(dto.boardId) : undefined,
      columnId: dto.columnId || dto.boardColumnId || dto.status || 'todo',
      key,
      type: dto.type || 'task',
      priority: dto.priority || 'medium',
      assigneeId: dto.assigneeId
        ? new Types.ObjectId(dto.assigneeId)
        : undefined,
      reporterId: new Types.ObjectId(userId),
      storyPoints: dto.storyPoints,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    };
  }

  transformUpdateInput(dto: UpdateTaskDto): Partial<Task> {
    const updateData: Record<string, unknown> = { ...dto };

    delete updateData.status;
    delete updateData.boardColumnId;

    if (dto.assigneeId) {
      updateData.assigneeId = new Types.ObjectId(dto.assigneeId);
    }
    if (dto.sprintId) {
      updateData.sprintId = new Types.ObjectId(dto.sprintId);
    }
    if (dto.boardId) {
      updateData.boardId = new Types.ObjectId(dto.boardId);
    }
    if (dto.columnId || dto.boardColumnId || dto.status) {
      updateData.columnId = dto.columnId || dto.boardColumnId || dto.status;
    }
    if (dto.dueDate) {
      updateData.dueDate = new Date(dto.dueDate);
    }

    return updateData as Partial<Task>;
  }
}

