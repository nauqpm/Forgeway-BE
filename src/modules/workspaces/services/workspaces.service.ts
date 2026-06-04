import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { SPACE_ROLES, SpaceRole } from '../../../common/constants/space-role.constants';
import { removeVietnameseTones } from '../../../common/utils/slug.utils';
import { UsersService } from '../../users/services/users.service';
import { WorkflowsService } from '../../workflows/services/workflows.service';
import { KanbanService } from '../../kanban/services/kanban.service';
import { ScrumService } from '../../scrum/services/scrum.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from '../dtos/create-workspace.dto';
import { WorkspacesRepository } from '../repositories/workspaces.repository';
import { ChannelsService } from '../../chat/services/channels.service';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly workflowsService: WorkflowsService,
    private readonly kanbanService: KanbanService,
    @Inject(forwardRef(() => ScrumService))
    private readonly scrumService: ScrumService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly channelsService: ChannelsService,
  ) { }

  public async create(userId: string, dto: CreateWorkspaceDto): Promise<any> {
    this.logger.log(`Bắt đầu tạo Workspace: "${dto.name}" bởi User: ${userId}`);
    const slug = dto.slug || (await this.generateUniqueSlug(dto.name));
    const key = await this.generateUniqueKey(dto.key || dto.name);

    const existingSlug = await this.workspacesRepository.findAnyBySlug(slug);
    if (existingSlug) {
      this.logger.warn(`Tạo Workspace thất bại: Slug "${slug}" đã tồn tại.`);
      throw new BadRequestException(`Workspace with slug "${slug}" already exists`);
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
          { userId: new Types.ObjectId(userId), role: SPACE_ROLES.WORKSPACE_ADMIN },
        ],
        settings: {},
        status: 'active',
      });

      this.logger.log(`Workspace tạo thành công: ${workspace.name} (ID: ${workspace._id}, Key: ${workspace.key})`);

      // Initialize default board for Kanban/Scrum
      try {
        await this.kanbanService.createDefaultBoard(workspace._id.toString());
        this.logger.log(`Đã tạo Board mặc định cho Workspace ${workspace._id}`);
      } catch (error) {
        this.logger.error(`Lỗi khi tạo Board mặc định cho Workspace ${workspace._id}`, error);
      }

      try {
        await this.workflowsService.createDefaultWorkflow(workspace._id.toString());
        this.logger.log(`Đã tạo Workflow mặc định cho Workspace ${workspace._id}`);
      } catch (error) {
        if (error instanceof ConflictException) {
          this.logger.warn(`Workflow đã tồn tại cho Workspace ${workspace._id}, bỏ qua bước tạo.`);
        } else {
          this.logger.error(`Lỗi khi tạo Workflow mặc định cho Workspace ${workspace._id}`, error);
        }
      }

      // Create workspace channel
      await this.channelsService.createWorkspaceChannel(
        workspace._id.toString(),
        userId
      );

      return workspace;
    } catch (error) {
      this.logger.error(`Lỗi hệ thống khi tạo Workspace "${dto.name}":`, error);
      throw error;
    }
  }

  public async findAll(): Promise<any[]> {
    return this.workspacesRepository.findAll();
  }

  public async findById(id: string): Promise<any> {
    const workspace = await this.workspacesRepository.findById(id);
    if (!workspace) {
      this.logger.warn(`Không tìm thấy Workspace với ID: ${id}`);
      throw new NotFoundException(`Workspace with ID "${id}" not found`);
    }
    return workspace;
  }

  public async findBySlug(slug: string): Promise<any> {
    const workspace = await this.workspacesRepository.findBySlug(slug);
    if (!workspace) {
      this.logger.warn(`Không tìm thấy Workspace với Slug: ${slug}`);
      throw new NotFoundException(`Workspace with slug "${slug}" not found`);
    }
    return workspace;
  }

  public async findByKey(key: string): Promise<any> {
    throw new BadRequestException('Workspace key lookup is not supported; use workspaceId');
    const workspace = null as any;
    if (!workspace) {
      this.logger.warn(`Không tìm thấy Workspace với Key: ${key}`);
      throw new NotFoundException(`Workspace with key "${key}" not found`);
    }
    return workspace;
  }

  public async findByUserId(userId: string): Promise<any[]> {
    this.logger.log(`Đang tìm danh sách Workspace cho User ID: ${userId}`);
    return this.workspacesRepository.findByUserId(userId);
  }

  public async update(id: string, dto: UpdateWorkspaceDto): Promise<any> {
    this.logger.log(`Đang cập nhật Workspace ID: ${id}`);
    const workspace = await this.workspacesRepository.findById(id);
    if (!workspace) {
      this.logger.warn(`Cập nhật thất bại: Không tìm thấy Workspace ID: ${id}`);
      throw new NotFoundException(`Workspace with ID "${id}" not found`);
    }

    if (dto.name) {
      workspace.name = dto.name;
    }
    if (dto.description !== undefined) {
      workspace.description = dto.description;
    }
    if (dto.settings) {
      workspace.settings = { ...workspace.settings, ...dto.settings };
    }
    if (dto.key) {
      workspace.key = await this.generateUniqueKey(dto.key, id);
    }
    if (dto.type) {
      workspace.type = dto.type;
    }
    if (dto.status) {
      workspace.status = dto.status;
    }
    if (dto.access) {
      workspace.access = dto.access;
    }

    const updated = await this.workspacesRepository.update(id, workspace);
    this.logger.log(`Workspace cập nhật thành công: ${id}`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    try {
      await this.kanbanService.deleteByWorkspace(id);
      this.logger.log(`Đã xóa Board liên quan đến Workspace ID: ${id}`);
    } catch (error) {
      this.logger.error(`Lỗi khi dọn dẹp Board của Workspace ${id}:`, error);
    }

    try {
      await this.scrumService.deleteByWorkspace(id);
      this.logger.log(`Đã xóa Sprint liên quan đến Workspace ID: ${id}`);
    } catch (error) {
      this.logger.error(`Lỗi khi dọn dẹp Sprint của Workspace ${id}:`, error);
    }

    const deleted = await this.workspacesRepository.delete(id);
    if (!deleted) {
      this.logger.warn(`Soft-delete thất bại: Không tìm thấy Workspace ID: ${id}`);
      throw new NotFoundException(`Workspace with ID "${id}" not found`);
    }
    this.logger.log(`Workspace soft-deleted: ${id}`);
  }

  async restore(id: string): Promise<any> {
    const workspace = await this.workspacesRepository.restore(id);
    if (!workspace) {
      throw new NotFoundException(`Không tìm thấy Workspace bị xóa với ID "${id}" để khôi phục`);
    }

    try {
      await this.scrumService.restoreByWorkspace(id);
      this.logger.log(`Khôi phục dữ liệu Sprint cho Workspace với ID: ${id}`);
    } catch (error) {
      this.logger.error(`Lỗi khi khôi phục dữ liệu Sprint cho Workspace ${id}:`, error);
    }

    this.logger.log(`Workspace đã được khôi phục: ${workspace._id}`);
    return workspace;
  }

  public async addMember(
    workspaceId: string,
    email: string,
    role: SpaceRole,
  ): Promise<any> {
    this.logger.log(`Đang thêm thành viên ${email} vào Workspace ${workspaceId}`);
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace) {
      this.logger.warn(`Thêm thành viên thất bại: Không tìm thấy Workspace ${workspaceId}`);
      throw new NotFoundException(`Workspace with ID "${workspaceId}" not found`);
    }

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      this.logger.warn(`Thêm thành viên thất bại: Không tìm thấy User với email ${email}`);
      throw new NotFoundException(`User with email "${email}" not found`);
    }

    const userId = user._id.toString();
    const isAlreadyMember = workspace.members.some(
      (member) => member.userId.toString() === userId,
    );
    if (isAlreadyMember) {
      this.logger.warn(`Thành viên ${email} đã có trong Workspace ${workspaceId}`);
      throw new BadRequestException(`User with email "${email}" is already a member`);
    }

    const updated = await this.workspacesRepository.addMember(workspaceId, userId, role);
    this.logger.log(`Đã thêm thành viên ${email} vào Workspace ${workspaceId} với vai trò ${role}`);
    return updated;
  }


  public async removeMember(workspaceId: string, userId: string): Promise<any> {
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException(`Workspace with ID "${workspaceId}" not found`);
    }

    const member = workspace.members.find(
      (item) => item.userId.toString() === userId,
    );
    if (!member) {
      throw new NotFoundException(`User "${userId}" is not a member`);
    }

    if (workspace.ownerId.toString() === userId) {
      throw new ForbiddenException('Cannot remove workspace owner');
    }

    await this.ensureNotLastAdmin(workspace, userId);

    const updated = await this.workspacesRepository.removeMember(workspaceId, userId);
    this.logger.log(`Member ${userId} removed from workspace ${workspaceId}`);
    return updated;
  }

  public async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: SpaceRole,
  ): Promise<any> {
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException(`Workspace with ID "${workspaceId}" not found`);
    }

    const member = workspace.members.find(
      (item) => item.userId.toString() === userId,
    );
    if (!member) {
      throw new NotFoundException(`User "${userId}" is not a member`);
    }

    if (workspace.ownerId.toString() === userId) {
      throw new ForbiddenException('Cannot change owner role');
    }

    if (member.role === SPACE_ROLES.WORKSPACE_ADMIN && role !== SPACE_ROLES.WORKSPACE_ADMIN) {
      await this.ensureNotLastAdmin(workspace, userId);
    }

    const updated = await this.workspacesRepository.updateMemberRole(
      workspaceId,
      userId,
      role,
    );
    this.logger.log(`Member ${userId} role updated to ${role} in workspace ${workspaceId}`);
    return updated;
  }

  private ensureNotLastAdmin(workspace: any, userId: string): void {
    const adminCount = workspace.members.filter(
      (m: any) => m.role === SPACE_ROLES.WORKSPACE_ADMIN,
    ).length;
    const isTargetAdmin = workspace.members.some(
      (m: any) => m.userId.toString() === userId && m.role === SPACE_ROLES.WORKSPACE_ADMIN,
    );
    if (adminCount === 1 && isTargetAdmin) {
      throw new BadRequestException('Cannot remove or demote the last workspace admin');
    }
  }

  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace) {
      return false;
    }
    return workspace.members.some((member) => member.userId.toString() === userId);
  }

  private async isAdmin(workspaceId: string, userId: string): Promise<boolean> {
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace) {
      return false;
    }
    const member = workspace.members.find(
      (item) => item.userId.toString() === userId,
    );
    return workspace.ownerId.toString() === userId || member?.role === SPACE_ROLES.WORKSPACE_ADMIN;
  }

  private async isOwner(workspaceId: string, userId: string): Promise<boolean> {
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace) {
      return false;
    }
    return workspace.ownerId.toString() === userId;
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = removeVietnameseTones(name).substring(0, 50);

    let slug = baseSlug;
    let counter = 1;

    while (await this.workspacesRepository.findAnyBySlug(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter += 1;
    }

    return slug;
  }

  private async generateUniqueKey(source: string, currentWorkspaceId?: string): Promise<string> {
    const baseKey =
      source
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 10) || 'SPACE';

    let key = baseKey;
    let counter = 1;

    while (true) {
      const existing = await this.workspacesRepository.findAnyByKey(key);
      if (!existing || existing._id.toString() === currentWorkspaceId) {
        return key;
      }

      const suffix = counter.toString();
      key = `${baseKey.substring(0, Math.max(1, 10 - suffix.length))}${suffix}`;
      counter += 1;

      if (counter > 999) {
        throw new ConflictException('Unable to generate unique workspace key');
      }
    }
  }

  async getMembers(workspaceId: string): Promise<any[]> {
    const workspace = await this.workspacesRepository.findByIdWithMembers(workspaceId);
    if (!workspace) {
      throw new NotFoundException(`Workspace with ID "${workspaceId}" not found`);
    }
    return workspace.members;
  }
}
