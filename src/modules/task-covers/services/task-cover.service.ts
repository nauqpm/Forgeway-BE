import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TaskActivitiesService } from '../../task-activities/services/task-activities.service';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { TaskCoverUpdatedEvent } from '../../../shared/events/domain-events/task';
import { SetTaskCoverDto } from '../dtos/set-task-cover.dto';
import { TaskCoverDto } from '../dtos/task-cover.dto';
import { TaskCoverMapper } from '../mappers/task-cover.mapper';
import { TaskCoverPolicy } from '../policies/task-cover.policy';
import { TaskCoverRepository } from '../repositories/task-cover.repository';

@Injectable()
export class TaskCoverService {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
    private readonly taskCoverRepository: TaskCoverRepository,
    private readonly taskCoverMapper: TaskCoverMapper,
    private readonly taskCoverPolicy: TaskCoverPolicy,
    private readonly taskActivitiesService: TaskActivitiesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getCover(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<TaskCoverDto | null> {
    await this.assertWorkspaceMember(workspaceId, userId);
    const task = await this.getTaskInWorkspace(workspaceId, taskId);

    return this.taskCoverMapper.mapToDto(task.cover);
  }

  async setCover(
    workspaceId: string,
    taskId: string,
    dto: SetTaskCoverDto,
    userId: string,
  ): Promise<TaskCoverDto> {
    await this.assertWorkspaceMember(workspaceId, userId);
    const task = await this.getTaskInWorkspace(workspaceId, taskId);
    this.taskCoverPolicy.assertCanModify(task);

    const cover = this.taskCoverMapper.mapInputToCover(dto, userId);
    const updatedTask = await this.taskCoverRepository.setCover(
      workspaceId,
      taskId,
      cover,
    );

    if (!updatedTask?.cover) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    await this.taskActivitiesService.recordTaskCoverChanged(
      updatedTask,
      userId,
      'set',
      task.cover?.type,
      updatedTask.cover.type,
    );

    const coverDto = this.taskCoverMapper.mapToDto(
      updatedTask.cover,
    ) as TaskCoverDto;
    this.publishCoverUpdatedEvent(updatedTask, userId, coverDto);

    return coverDto;
  }

  async removeCover(
    workspaceId: string,
    taskId: string,
    userId: string,
  ): Promise<void> {
    await this.assertWorkspaceMember(workspaceId, userId);
    const task = await this.getTaskInWorkspace(workspaceId, taskId);
    this.taskCoverPolicy.assertCanModify(task);

    const updatedTask = await this.taskCoverRepository.removeCover(
      workspaceId,
      taskId,
    );

    if (!updatedTask) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    await this.taskActivitiesService.recordTaskCoverChanged(
      updatedTask,
      userId,
      'remove',
      task.cover?.type,
      null,
    );
    this.publishCoverUpdatedEvent(updatedTask, userId, null);
  }

  private publishCoverUpdatedEvent(
    task: any,
    actorId: string,
    cover: TaskCoverDto | null,
  ): void {
    const event = new TaskCoverUpdatedEvent({
      workspaceId: this.toId(task.workspaceId),
      taskId: this.toId(task._id),
      taskKey: task.key,
      actorId,
      version: task.version,
      cover,
    });

    this.eventEmitter.emit(event.type, event);
  }
  private async getTaskInWorkspace(workspaceId: string, taskId: string) {
    const task = await this.taskCoverRepository.findTaskInWorkspace(
      workspaceId,
      taskId,
    );

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    return task;
  }

  private toId(value: any): string {
    return value?._id?.toString?.() ?? value?.toString?.() ?? '';
  }

  private async assertWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    await this.workspacesService.findById(workspaceId);
    const isMember = await this.workspaceMemberService.isMember(
      workspaceId,
      userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Workspace access denied');
    }
  }
}
