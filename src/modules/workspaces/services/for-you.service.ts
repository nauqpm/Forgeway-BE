import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { ForYouResponseDto, ForYouWorkspaceDto } from '../dtos/for-you.dto';
import { WorkspacesRepository } from '../repositories/workspaces.repository';
import { WorkspaceDocument } from '../schemas/workspace.schema';

@Injectable()
export class ForYouService {
  private readonly logger = new Logger(ForYouService.name);

  constructor(private readonly workspacesRepository: WorkspacesRepository) {}

  async getForYouWorkspaces(userId: string): Promise<ForYouResponseDto> {
    if (!userId?.trim()) {
      this.logger.warn('Rejected /for-you request without a valid userId');
      throw new UnauthorizedException('Invalid user ID');
    }

    this.logger.debug(`Fetching for-you workspaces for user ${userId}`);
    const workspaces = await this.workspacesRepository.findActiveForUserOverview(userId);
    const workspaceDtos = workspaces.map((workspace) =>
      this.mapWorkspaceToForYouDto(workspace, userId),
    );

    this.logger.log(`Retrieved ${workspaceDtos.length} for-you workspaces for user ${userId}`);
    return {
      success: true,
      workspaces: workspaceDtos,
    };
  }

  private mapWorkspaceToForYouDto(
    workspace: WorkspaceDocument,
    userId: string,
  ): ForYouWorkspaceDto {
    const isOwner = workspace.ownerId.toString() === userId;
    const member = workspace.members.find((item) => item.userId.toString() === userId);

    return {
      id: workspace._id.toString(),
      name: workspace.name,
      description: workspace.description,
      slug: workspace.slug,
      key: workspace.key,
      type: workspace.type,
      status: workspace.status,
      role: isOwner ? SPACE_ROLES.SPACE_ADMIN : member?.role ?? SPACE_ROLES.VIEWER,
      relationship: isOwner ? 'owner' : 'member',
      ownershipLabel: isOwner ? 'Sở hữu' : 'Tham gia',
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }
}
