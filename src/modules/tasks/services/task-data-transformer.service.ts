import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { CreateTaskDto, UpdateTaskDto } from '../dtos/requests/create-task.dto';
import { Task } from '../schemas/task.schema';
import { buildTaskSearchTokens } from '../utils/search-token.util';
import { normalizeForSearch } from '../../../common/utils/normalizeForSearch';

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
      columnId: dto.columnId,
      status: dto.status || 'todo',
      key,
      searchTokens: buildTaskSearchTokens(key, dto.title),
      searchText: normalizeForSearch(
        [key, dto.title, dto.description].join(' '),
      ),
      type: dto.type || 'task',
      priority: dto.priority || 'medium',
      assigneeId: dto.assigneeId
        ? new Types.ObjectId(dto.assigneeId)
        : undefined,
      reporterId: new Types.ObjectId(userId),
      storyPoints: dto.storyPoints,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      epicId: (dto as any).epicId
        ? new Types.ObjectId((dto as any).epicId)
        : undefined,
      parentId: (dto as any).parentId
        ? new Types.ObjectId((dto as any).parentId)
        : undefined,
      labelIds: dto.labelIds
        ? dto.labelIds.map(id => new Types.ObjectId(id))
        : [],
      timeEstimated:
        dto.timeEstimated !== undefined
          ? Math.max(0, dto.timeEstimated)
          : undefined,
      timeLogged:
        dto.timeLogged !== undefined ? Math.max(0, dto.timeLogged) : 0,
    };
  }

  transformUpdateInput(
    dto: UpdateTaskDto,
    existingTask?: Pick<Task, 'key' | 'title' | 'description'>,
  ): Partial<Task> {
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
    if (dto.startDate !== undefined) {
      updateData.startDate = dto.startDate ? new Date(dto.startDate) : null;
    }
    if (dto.dueDate !== undefined) {
      updateData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (
      (dto.title !== undefined || dto.description !== undefined) &&
      existingTask
    ) {
      updateData.searchTokens = buildTaskSearchTokens(
        existingTask.key,
        dto.title ?? existingTask.title,
      );
      updateData.searchText = normalizeForSearch(
        [
          existingTask.key,
          dto.title ?? existingTask.title,
          dto.description ?? existingTask.description,
        ].join(' '),
      );
    }

    // timeLogged: FE gửi dạng giờ (số thực), ghi thẳng vào DB
    if (dto.timeLogged !== undefined) {
      updateData.timeLogged = Math.max(0, dto.timeLogged);
    }

    // timeEstimated: FE gửi dạng giờ (số thực), ghi thẳng vào DB
    if (dto.timeEstimated !== undefined) {
      updateData.timeEstimated = Math.max(0, dto.timeEstimated);
    }

    // parentId: null = unlink (convert subtask → task), string = set parent
    if ('parentId' in dto) {
      if ((dto as any).parentId === null) {
        updateData.parentId = null;
      } else if ((dto as any).parentId) {
        updateData.parentId = new Types.ObjectId((dto as any).parentId);
      }
    }

    return updateData;
  }
}
