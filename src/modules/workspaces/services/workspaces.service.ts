import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { ErrorFactory } from '../../../common/factories/error.factory';
import { WorkflowsService } from '../../workflows/services/workflows.service';
import { KanbanService } from '../../kanban/services/kanban.service';
import { ScrumService } from '../../scrum/services/scrum.service';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import {
  DocumentDoc,
  DocumentEntity,
} from '../../documents/schemas/document.schema';
import { Page, PageDocument } from '../../pages/schemas/page.schema';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
} from '../dtos/create-workspace.dto';
import { WorkspacesRepository } from '../repositories/workspaces.repository';
import { WorkspaceKeyService } from './workspace-key.service';
import { WorkspaceDomainEventPublisher } from './workspace-domain-event.publisher';
import { ChannelsService } from '../../chat/services/channels.service';
import { WorkspacePreferencesService } from '../../workspace-preferences/services/workspace-preferences.service';
import {
  DEFAULT_WORKSPACE_AVATAR,
  WORKSPACE_SAMPLE_AVATARS,
  isWorkspaceSampleAvatar,
} from '../constants/workspace-sample-avatars.constant';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly workflowsService: WorkflowsService,
    private readonly kanbanService: KanbanService,
    @Inject(forwardRef(() => ScrumService))
    private readonly scrumService: ScrumService,
    private readonly workspaceKeyService: WorkspaceKeyService,
    private readonly workspaceDomainEventPublisher: WorkspaceDomainEventPublisher,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Page.name)
    private readonly pageModel: Model<PageDocument>,
    @InjectModel(DocumentEntity.name)
    private readonly documentModel: Model<DocumentDoc>,
    @Inject(forwardRef(() => ChannelsService))
    private readonly channelsService: ChannelsService,
    @Optional()
    private readonly workspacePreferencesService?: WorkspacePreferencesService,
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto): Promise<any> {
    this.logger.log(`Creating workspace "${dto.name}" for user ${userId}`);
    const slug =
      dto.slug || (await this.workspaceKeyService.generateUniqueSlug(dto.name));
    const key = await this.workspaceKeyService.generateUniqueKey(
      dto.key || dto.name,
    );
    const avatar = this.resolveWorkspaceAvatar(dto.avatar);

    const existingSlug = await this.workspacesRepository.findAnyBySlug(slug);
    if (existingSlug) {
      throw new BadRequestException(
        `Workspace with slug "${slug}" already exists`,
      );
    }

    try {
      const workspace = await this.workspacesRepository.create({
        name: dto.name,
        description: dto.description,
        avatar,
        slug,
        key,
        type: dto.type || 'kanban',
        access: dto.access || 'public',
        ownerId: new Types.ObjectId(userId),
        members: [
          {
            userId: new Types.ObjectId(userId),
            role: SPACE_ROLES.WORKSPACE_ADMIN,
          },
        ],
        settings: {},
        status: 'active',
      });

      try {
        await this.kanbanService.createDefaultBoard(workspace._id.toString());
      } catch (error) {
        this.logger.error(
          `Failed to create default board for workspace ${workspace._id}`,
          error,
        );
      }

      try {
        await this.workflowsService.createDefaultWorkflow(
          workspace._id.toString(),
        );
      } catch (error) {
        if (error instanceof ConflictException) {
          this.logger.warn(
            `Default workflow already exists for workspace ${workspace._id}`,
          );
        } else {
          this.logger.error(
            `Failed to create default workflow for workspace ${workspace._id}`,
            error,
          );
        }
      }

      // Publish domain event
      this.workspaceDomainEventPublisher.publishCreated(workspace, userId);

      // Create workspace channel
      await this.channelsService.createWorkspaceChannel(
        workspace._id.toString(),
        userId,
      );

      return workspace;
    } catch (error) {
      this.logger.error(`Failed to create workspace "${dto.name}"`, error);
      throw error;
    }
  }

  async findAll(): Promise<any[]> {
    const workspaces = await this.workspacesRepository.findAll();
    return workspaces.map(workspace => this.withDefaultAvatar(workspace));
  }

  async findAllWithDeleted(): Promise<any[]> {
    const workspaces = await this.workspacesRepository.findAllWithDeleted();
    return workspaces.map(workspace => this.withDefaultAvatar(workspace));
  }

  async findById(id: string): Promise<any> {
    const workspace = await this.workspacesRepository.findById(id);
    if (!workspace) {
      throw new NotFoundException(ErrorFactory.workspaceNotFound(id));
    }
    return this.withDefaultAvatar(workspace);
  }

  async findBySlug(slug: string): Promise<any> {
    const workspace = await this.workspacesRepository.findBySlug(slug);
    if (!workspace) {
      throw new NotFoundException(ErrorFactory.workspaceNotFound(slug));
    }
    return this.withDefaultAvatar(workspace);
  }

  async findByKey(_key: string): Promise<any> {
    throw new BadRequestException(
      'Workspace key lookup is not supported; use workspaceId',
    );
  }

  getAvatarSamples() {
    return { avatars: WORKSPACE_SAMPLE_AVATARS };
  }

  async findByUserId(userId: string): Promise<any[]> {
    const [workspaces, preferences] = await Promise.all([
      this.workspacesRepository.findByUserId(userId),
      this.workspacePreferencesService?.findByUserId(userId) ??
        Promise.resolve([]),
    ]);
    const preferenceMap = new Map(
      preferences.map(preference => [
        preference.workspaceId.toString(),
        preference,
      ]),
    );
    const hasCompletePreferenceOrder = workspaces.every(workspace =>
      preferenceMap.has(workspace._id.toString()),
    );

    const sortedWorkspaces = [...workspaces];
    if (hasCompletePreferenceOrder && preferences.length > 0) {
      sortedWorkspaces.sort((a, b) => {
        const positionA = preferenceMap.get(a._id.toString())?.position;
        const positionB = preferenceMap.get(b._id.toString())?.position;
        if (positionA !== undefined && positionB !== undefined)
          return positionA - positionB;
        if (positionA !== undefined) return -1;
        if (positionB !== undefined) return 1;
        return (
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime()
        );
      });
    }

    const counted = await this.withWorkspaceCounts(sortedWorkspaces);
    return counted.map((workspace, index) => {
      const preference = preferenceMap.get(workspace._id.toString());
      return {
        ...workspace,
        isStarred: preference?.isStarred ?? false,
        position: preference?.position ?? index,
      };
    });
  }

  async findStarredByUserId(userId: string): Promise<any[]> {
    const workspaces = await this.findByUserId(userId);
    return workspaces.filter(workspace => workspace.isStarred);
  }

  private async withWorkspaceCounts(workspaces: any[]): Promise<any[]> {
    return Promise.all(
      workspaces.map(async workspace => {
        const workspaceId = workspace._id;
        const [taskCount, pageCount, documentCount] = await Promise.all([
          this.taskModel.countDocuments({
            workspaceId,
            isDeleted: { $ne: true },
          }),
          this.pageModel.countDocuments({ workspaceId }),
          this.documentModel.countDocuments({
            workspaceIds: workspaceId,
            deletedAt: null,
          }),
        ]);
        const docsCount = pageCount + documentCount;
        const workspaceData = this.withDefaultAvatar(workspace);

        return {
          ...workspaceData,
          _count: {
            ...(workspaceData._count ?? {}),
            tasks: taskCount,
            issues: taskCount,
            docs: docsCount,
            pages: pageCount,
          },
          taskCount,
          tasksCount: taskCount,
          docsCount,
        };
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateWorkspaceDto,
    actorId?: string,
  ): Promise<any> {
    const workspace = await this.workspacesRepository.findById(id);
    if (!workspace) {
      throw new NotFoundException(ErrorFactory.workspaceNotFound(id));
    }

    if (dto.name) workspace.name = dto.name;
    if (dto.description !== undefined) workspace.description = dto.description;
    if (dto.avatar !== undefined)
      workspace.avatar = this.resolveWorkspaceAvatar(dto.avatar);
    if (dto.settings)
      workspace.settings = { ...workspace.settings, ...dto.settings };
    if (dto.key)
      workspace.key = await this.workspaceKeyService.generateUniqueKey(
        dto.key,
        id,
      );
    if (dto.type) workspace.type = dto.type;
    if (dto.status) workspace.status = dto.status;
    if (dto.access) workspace.access = dto.access;
    if (dto.ownerId) {
      const { Types } = require('mongoose');
      workspace.ownerId = new Types.ObjectId(dto.ownerId);

      // Update members array to include the new owner as admin if they aren't already
      const newOwnerIdStr = dto.ownerId.toString();
      const existingMemberIndex = workspace.members.findIndex(
        m => m.userId.toString() === newOwnerIdStr,
      );

      if (existingMemberIndex >= 0) {
        workspace.members[existingMemberIndex].role =
          SPACE_ROLES.WORKSPACE_ADMIN;
      } else {
        workspace.members.push({
          userId: new Types.ObjectId(dto.ownerId),
          role: SPACE_ROLES.WORKSPACE_ADMIN,
        });
      }
    }

    const updated = await this.workspacesRepository.update(id, workspace);
    if (updated) {
      this.workspaceDomainEventPublisher.publishUpdated(updated, actorId);
    }

    return updated ? this.withDefaultAvatar(updated) : updated;
  }

  async delete(id: string, actorId?: string): Promise<void> {
    const workspace = await this.workspacesRepository.findById(id);
    if (!workspace) {
      throw new NotFoundException(ErrorFactory.workspaceNotFound(id));
    }

    try {
      await this.kanbanService.deleteByWorkspace(id);
    } catch (error) {
      this.logger.error(
        `Failed to cleanup board data for workspace ${id}`,
        error,
      );
    }

    try {
      await this.scrumService.deleteByWorkspace(id);
    } catch (error) {
      this.logger.error(
        `Failed to cleanup sprint data for workspace ${id}`,
        error,
      );
    }

    const deleted = await this.workspacesRepository.delete(id);
    if (!deleted) {
      throw new NotFoundException(ErrorFactory.workspaceNotFound(id));
    }

    await this.workspacePreferencesService?.deleteByWorkspace(id);

    this.workspaceDomainEventPublisher.publishDeleted(id, workspace, actorId);
  }

  async restore(id: string, actorId?: string): Promise<any> {
    const workspace = await this.workspacesRepository.restore(id);
    if (!workspace) {
      throw new NotFoundException(ErrorFactory.workspaceNotFound(id));
    }

    try {
      await this.scrumService.restoreByWorkspace(id);
    } catch (error) {
      this.logger.error(
        `Failed to restore sprint data for workspace ${id}`,
        error,
      );
    }

    this.workspaceDomainEventPublisher.publishRestored(workspace, actorId);
    return this.withDefaultAvatar(workspace);
  }

  async archive(id: string, actorId?: string): Promise<any> {
    const workspace = await this.workspacesRepository.findById(id);
    if (!workspace) {
      throw new NotFoundException(ErrorFactory.workspaceNotFound(id));
    }

    workspace.status = 'archived';
    const archived = await this.workspacesRepository.update(id, workspace);
    if (archived) {
      this.workspaceDomainEventPublisher.publishArchived(archived, actorId);
    }

    return archived ? this.withDefaultAvatar(archived) : archived;
  }

  private resolveWorkspaceAvatar(avatar?: string): string {
    if (!avatar) {
      return DEFAULT_WORKSPACE_AVATAR;
    }

    if (!isWorkspaceSampleAvatar(avatar)) {
      throw new BadRequestException(
        'Workspace avatar must be one of the sample avatars',
      );
    }

    return avatar;
  }

  private withDefaultAvatar(workspace: any): any {
    const workspaceData =
      typeof workspace?.toObject === 'function'
        ? workspace.toObject()
        : { ...workspace };

    return {
      ...workspaceData,
      avatar: workspaceData.avatar || DEFAULT_WORKSPACE_AVATAR,
    };
  }
}
