import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { CreateTaskDto } from '../dtos/requests/create-task.dto';
import { SubtaskSummaryDto } from '../dtos/responses/task-detail.dto';
import { TaskDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TaskReadRepository } from '../repositories/task-read.repository';
import { TaskWriteRepository } from '../repositories/task-write.repository';
import { TaskAccessService } from './task-access.service';
import { TaskCreateService } from './task-create.service';
import { TaskCreationValidationService } from './task-creation-validation.service';
import { TaskDomainEventPublisher } from './task-domain-event.publisher';
import { WorkflowsService } from '../../workflows/services/workflows.service';

/**
 * Trích xuất ObjectId string từ một field có thể là:
 * - raw ObjectId / string
 * - populated Mongoose document (có ._id)
 * Tránh trường hợp `.toString()` trả về "[object Object]".
 */
function toRawId(value: unknown): string | undefined {
  if (!value) return undefined;
  // Populated document hoặc plain object có _id
  if (typeof value === 'object' && '_id' in value) {
    return (value as any)._id?.toString();
  }
  return (value as any).toString();
}

@Injectable()
export class SubtaskService {
  private readonly logger = new Logger(SubtaskService.name);

  constructor(
    private readonly taskReadRepository: TaskReadRepository,
    private readonly taskWriteRepository: TaskWriteRepository,
    private readonly taskMapper: TaskMapper,
    private readonly taskCreateService: TaskCreateService,
    private readonly taskAccessService: TaskAccessService,
    private readonly validationService: TaskCreationValidationService,
    private readonly taskActivitiesService: TaskActivitiesService,
    private readonly taskDomainEventPublisher: TaskDomainEventPublisher,
    private readonly workflowsService: WorkflowsService,
  ) {}

  // create Subtask
  async createSubtask(
    parentId: string,
    dto: Omit<CreateTaskDto, 'type' | 'epicId' | 'storyPoints'>,
    userId: string,
    workspaceId: string,
  ): Promise<TaskDto> {
    this.validationService.validateObjectId(parentId, 'Parent task');
    // [H1] Verify caller is a member of the workspace before proceeding
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    const parent = await this.taskReadRepository.findByIdInWorkspace(
      parentId,
      workspaceId,
    );
    if (!parent) {
      throw new NotFoundException(`Parent task with ID ${parentId} not found`);
    }

    if (parent.type === 'subtask') {
      throw new BadRequestException(
        'Cannot create a subtask under another subtask (only one level of nesting allowed)',
      );
    }

    if (parent.type === 'epic') {
      throw new BadRequestException(
        'Cannot create a subtask under an Epic. Use child issues instead.',
      );
    }

    const parentPlain =
      typeof parent.toObject === 'function' ? parent.toObject() : parent;

    // OCC guard: atomically claim the parent before creating the child.
    // This bumps the parent's version so any concurrent convertToSubtask
    // that already read the old version will fail its version-filtered update.
    const claimed = await this.taskWriteRepository.claimParentForChildCreation(
      parentId,
      workspaceId,
      parentPlain.version as number,
    );
    if (!claimed) {
      // Re-read to give a precise domain error instead of a generic message.
      const currentParent = await this.taskReadRepository.findByIdInWorkspace(
        parentId,
        workspaceId,
      );
      if (!currentParent) {
        throw new NotFoundException(
          `Parent task with ID ${parentId} not found`,
        );
      }
      if (currentParent.type === 'subtask') {
        throw new ConflictException(
          'Parent task was concurrently converted to a subtask. ' +
            'Subtasks cannot have nested subtasks.',
        );
      }
      throw new ConflictException(
        'Parent task was modified concurrently. Please try again.',
      );
    }

    const createDto: CreateTaskDto = {
      ...dto,
      type: 'subtask',
      parentId,
      // Dùng toRawId() để đảm bảo luôn nhận được ObjectId string hợp lệ
      // kể cả khi sprintId đã được Mongoose populate thành document object.
      sprintId: toRawId(parentPlain.sprintId),
    };

    const task = await this.taskCreateService.createInWorkspaceId(
      workspaceId,
      createDto,
      userId,
    );

    this.logger.log(
      `Subtask created: ${task.key} under parent ${parentPlain.key}`,
    );
    return task;
  }

  // Query subtasks
  async getSubtasksOfTask(
    parentId: string,
    workspaceId: string,
    userId: string,
  ): Promise<{
    subtasks: SubtaskSummaryDto[];
    progress: { done: number; total: number };
  }> {
    this.validationService.validateObjectId(parentId, 'Parent task');
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    const parent = await this.taskReadRepository.findByIdInWorkspace(
      parentId,
      workspaceId,
    );
    if (!parent) {
      throw new NotFoundException(`Task with ID ${parentId} not found`);
    }

    // [H3] Chạy song song thay vì serial để giảm DB round-trips
    const doneStatusIds =
      await this.workflowsService.getDoneStatusIds(workspaceId);
    const [subtasks, total, done] = await Promise.all([
      this.taskReadRepository.findSubtasksByParentId(parentId, workspaceId),
      this.taskReadRepository.countSubtasksByParentId(parentId),
      this.taskReadRepository.countDoneSubtasksByParentId(
        parentId,
        doneStatusIds,
      ),
    ]);

    return {
      subtasks: this.taskMapper.mapSubtaskSummaries(subtasks),
      progress: { done, total },
    };
  }

  async getSubtaskProgress(
    parentId: string,
    workspaceId: string,
  ): Promise<{ done: number; total: number }> {
    const doneStatusIds =
      await this.workflowsService.getDoneStatusIds(workspaceId);
    const [total, done] = await Promise.all([
      this.taskReadRepository.countSubtasksByParentId(parentId),
      this.taskReadRepository.countDoneSubtasksByParentId(
        parentId,
        doneStatusIds,
      ),
    ]);
    return { done, total };
  }

  // Delete Subtask
  async deleteSubtask(
    parentId: string,
    subtaskId: string,
    workspaceId: string,
    userId: string,
  ): Promise<TaskDto> {
    this.validationService.validateObjectId(parentId, 'Parent task');
    this.validationService.validateObjectId(subtaskId, 'Subtask');
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    const subtask = await this.taskReadRepository.findByIdInWorkspace(
      subtaskId,
      workspaceId,
    );
    if (!subtask) {
      throw new NotFoundException(`Subtask with ID ${subtaskId} not found`);
    }
    if (subtask.type !== 'subtask') {
      throw new BadRequestException(`Task ${subtaskId} is not a subtask`);
    }
    if (!subtask.parentId || subtask.parentId.toString() !== parentId) {
      throw new BadRequestException(
        `Subtask ${subtaskId} does not belong to task ${parentId}`,
      );
    }

    const deleted = await this.taskWriteRepository.softDeleteInWorkspace(
      subtaskId,
      workspaceId,
      userId,
    );
    if (!deleted) {
      throw new NotFoundException(`Subtask with ID ${subtaskId} not found`);
    }

    await this.taskActivitiesService.recordTaskPermanentlyDeleted(
      deleted,
      userId,
    );
    this.taskDomainEventPublisher.publishDeleted(deleted, userId);

    this.logger.log(`Subtask ${subtaskId} deleted from parent ${parentId}`);
    return this.taskMapper.mapToDto(deleted);
  }

  // Convert Subtask to Task
  //
  // STATUS INVARIANT: status được giữ nguyên sau khi convert.
  // Hệ thống dùng chung một status space (todo/inprogress/done/custom Kanban ids)
  // cho tất cả task types nên không cần map hay reset status khi chuyển type.
  async convertSubtaskToTask(
    subtaskId: string,
    workspaceId: string,
    userId: string,
  ): Promise<TaskDto> {
    this.validationService.validateObjectId(subtaskId, 'Subtask');
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    const subtask = await this.taskReadRepository.findByIdInWorkspace(
      subtaskId,
      workspaceId,
    );
    if (!subtask) {
      throw new NotFoundException(`Subtask with ID ${subtaskId} not found`);
    }
    if (subtask.type !== 'subtask') {
      throw new BadRequestException(`Task ${subtaskId} is not a subtask`);
    }

    // [C1+C2] Dùng repository method thay vì `as any` bypass
    const result = await this.taskWriteRepository.convertToTask(
      subtaskId,
      workspaceId,
    );

    // [C4] Null-safe — không dùng non-null assertion
    if (!result) {
      throw new NotFoundException(
        `Subtask ${subtaskId} not found after conversion`,
      );
    }

    this.logger.log(`Subtask ${subtaskId} converted to task`);

    await this.taskActivitiesService.recordTaskUpdated(subtask, result, userId);
    this.taskDomainEventPublisher.publishUpdated(subtask, result, userId);

    return this.taskMapper.mapToDto(result);
  }

  // Convert Task to Subtask
  //
  // STATUS INVARIANT: status được giữ nguyên sau khi convert.
  // Hệ thống dùng chung một status space (todo/inprogress/done/custom Kanban ids)
  // cho tất cả task types nên không cần map hay reset status khi chuyển type.
  async convertTaskToSubtask(
    taskId: string,
    newParentId: string,
    workspaceId: string,
    userId: string,
  ): Promise<TaskDto> {
    this.validationService.validateObjectId(taskId, 'Task');
    this.validationService.validateObjectId(newParentId, 'Parent task');
    await this.taskAccessService.getWorkspaceContextById(workspaceId, userId);

    if (taskId === newParentId) {
      throw new BadRequestException('A task cannot be its own parent');
    }

    const [task, parent] = await Promise.all([
      this.taskReadRepository.findByIdInWorkspace(taskId, workspaceId),
      this.taskReadRepository.findByIdInWorkspace(newParentId, workspaceId),
    ]);

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }
    if (!parent) {
      throw new NotFoundException(
        `Parent task with ID ${newParentId} not found`,
      );
    }

    if (task.type === 'subtask') {
      throw new BadRequestException(
        'Task is already a subtask. Remove it from its current parent before re-parenting.',
      );
    }

    if (task.type === 'epic') {
      throw new BadRequestException('Cannot convert an Epic to a subtask');
    }

    if (parent.type === 'subtask') {
      throw new BadRequestException(
        'Parent task cannot be a subtask (only one level of nesting allowed)',
      );
    }

    if (parent.type === 'epic') {
      throw new BadRequestException(
        'Cannot convert a task to a subtask under an Epic. Use child issues instead.',
      );
    }

    const childCount =
      await this.taskReadRepository.countSubtasksByParentId(taskId);
    if (childCount > 0) {
      throw new BadRequestException(
        `Task has ${childCount} subtask(s). Remove or move them before converting to a subtask.`,
      );
    }

    // Capture task version for OCC before the update.
    // createSubtask bumps the parent's version via claimParentForChildCreation;
    // if that raced with this read, our version-filtered update will return null.
    const taskPlain =
      typeof task.toObject === 'function' ? task.toObject() : task;
    const parentPlain =
      typeof parent.toObject === 'function' ? parent.toObject() : parent;

    // Normalise populated sprintId to a real Mongo ObjectId so the repository
    // stores a valid reference instead of an embedded document.
    const rawSprintId = toRawId(parentPlain.sprintId);
    const parentSprintId =
      rawSprintId && Types.ObjectId.isValid(rawSprintId)
        ? new Types.ObjectId(rawSprintId)
        : undefined;

    // [C1+C3] Dùng repository method thay vì `as any` bypass
    const result = await this.taskWriteRepository.convertToSubtask(
      taskId,
      workspaceId,
      parent._id,
      parentSprintId,
      taskPlain.version as number, // OCC token
    );

    if (!result) {
      // OCC miss: version changed since we read the task.
      // Re-read to surface the precise domain error.
      const currentChildCount =
        await this.taskReadRepository.countSubtasksByParentId(taskId);
      if (currentChildCount > 0) {
        throw new ConflictException(
          `Cannot convert: task acquired ${currentChildCount} subtask(s) concurrently. ` +
            `Remove or move them before converting.`,
        );
      }
      const stillExists = await this.taskReadRepository.findByIdInWorkspace(
        taskId,
        workspaceId,
      );
      if (!stillExists) {
        throw new NotFoundException(`Task ${taskId} not found`);
      }
      throw new ConflictException(
        'Task was modified concurrently. Please try again.',
      );
    }

    this.logger.log(`Task ${taskId} converted to subtask under ${newParentId}`);

    await this.taskActivitiesService.recordTaskUpdated(task, result, userId);
    this.taskDomainEventPublisher.publishUpdated(task, result, userId);

    return this.taskMapper.mapToDto(result);
  }
}
