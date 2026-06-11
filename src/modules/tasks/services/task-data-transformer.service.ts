import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { CreateTaskDto, UpdateTaskDto } from '../dtos/requests/create-task.dto';
import { Task } from '../schemas/task.schema';
import { buildTaskSearchTokens } from '../utils/search-token.util';

@Injectable()
export class TaskDataTransformerService {
  transformCreateInput(dto: CreateTaskDto, workspaceId: string, userId: string, key: string): Partial<Task> {
    return {
      title: dto.title,
      description: dto.description,
      workspaceId: new Types.ObjectId(workspaceId),
      sprintId: dto.sprintId ? new Types.ObjectId(dto.sprintId) : undefined,
      boardId: dto.boardId ? new Types.ObjectId(dto.boardId) : undefined,
      columnId: dto.columnId,
      status: dto.status || 'todo',
      key,
      searchTokens: buildTaskSearchTokens(key, dto.title),
      type: dto.type || 'task',
      priority: dto.priority || 'medium',
      assigneeId: dto.assigneeId ? new Types.ObjectId(dto.assigneeId) : undefined,
      reporterId: new Types.ObjectId(userId),
      storyPoints: dto.storyPoints,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      epicId: (dto as any).epicId ? new Types.ObjectId((dto as any).epicId) : undefined,
    };
  }

  transformUpdateInput(dto: UpdateTaskDto, existingTask?: Pick<Task, 'key' | 'title'>): Partial<Task> {
    const updateData: Record<string, unknown> = { ...dto };

    if (dto.assigneeId) {
      updateData.assigneeId = new Types.ObjectId(dto.assigneeId);
    }
    if (dto.sprintId) {
      updateData.sprintId = new Types.ObjectId(dto.sprintId);
    }
    if (dto.boardId) {
      updateData.boardId = new Types.ObjectId(dto.boardId);
    }
    if (dto.startDate) {
      updateData.startDate = new Date(dto.startDate);
    }
    if (dto.dueDate) {
      updateData.dueDate = new Date(dto.dueDate);
    }
    if (dto.title !== undefined && existingTask) {
      updateData.searchTokens = buildTaskSearchTokens(existingTask.key, dto.title);
    }

    return updateData as Partial<Task>;
  }
}
