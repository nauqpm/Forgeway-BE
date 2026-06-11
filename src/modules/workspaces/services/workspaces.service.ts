import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
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
import { UsersService } from '../../users/services/users.service';

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
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => ChannelsService))
    private readonly channelsService: ChannelsService,
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto): Promise<any> {
    this.logger.log(`Creating workspace "${dto.name}" for user ${userId}`);
    const slug =
      dto.slug || (await this.workspaceKeyService.generateUniqueSlug(dto.name));
    const key = await this.workspaceKeyService.generateUniqueKey(
      dto.key || dto.name,
    );

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
    return this.workspacesRepository.findAll();
  }

  async findAllWithDeleted(): Promise<any[]> {
    return this.workspacesRepository.findAllWithDeleted();
  }

  async findById(id: string): Promise<any> {
    const workspace = await this.workspacesRepository.findById(id);
    if (!workspace) {
      throw new NotFoundException(`Workspace with ID "${id}" not found`);
    }
    return workspace;
  }

  async findBySlug(slug: string): Promise<any> {
    const workspace = await this.workspacesRepository.findBySlug(slug);
    if (!workspace) {
      throw new NotFoundException(`Workspace with slug "${slug}" not found`);
    }
    return workspace;
  }

  async findByKey(_key: string): Promise<any> {
    throw new BadRequestException(
      'Workspace key lookup is not supported; use workspaceId',
    );
  }

  async findByUserId(userId: string): Promise<any[]> {
    const workspaces = await this.workspacesRepository.findByUserId(userId);
    return this.withWorkspaceCounts(workspaces);
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
        const workspaceData =
          typeof workspace.toObject === 'function'
            ? workspace.toObject()
            : { ...workspace };

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
      throw new NotFoundException(`Workspace with ID "${id}" not found`);
    }

    if (dto.name) workspace.name = dto.name;
    if (dto.description !== undefined) workspace.description = dto.description;
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

    const updated = await this.workspacesRepository.update(id, workspace);
    if (updated) {
      this.workspaceDomainEventPublisher.publishUpdated(updated, actorId);
    }

    return updated;
  }

  async delete(id: string, actorId?: string): Promise<void> {
    const workspace = await this.workspacesRepository.findById(id);
    if (!workspace) {
      throw new NotFoundException(`Workspace with ID "${id}" not found`);
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
      throw new NotFoundException(`Workspace with ID "${id}" not found`);
    }

    this.workspaceDomainEventPublisher.publishDeleted(id, workspace, actorId);
  }

  async restore(id: string, actorId?: string): Promise<any> {
    const workspace = await this.workspacesRepository.restore(id);
    if (!workspace) {
      throw new NotFoundException(
        `Deleted workspace with ID "${id}" not found`,
      );
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
    return workspace;
  }

  async archive(id: string, actorId?: string): Promise<any> {
    const workspace = await this.workspacesRepository.findById(id);
    if (!workspace) {
      throw new NotFoundException(`Workspace with ID "${id}" not found`);
    }

    workspace.status = 'archived';
    const archived = await this.workspacesRepository.update(id, workspace);
    if (archived) {
      this.workspaceDomainEventPublisher.publishArchived(archived, actorId);
    }

    return archived;
  }
}
