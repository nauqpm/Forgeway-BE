import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { WORKSPACE_PERMISSIONS } from '../../common/constants/workspace-permissions.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { CreateRequirementDto } from './dtos/requirement.dto';
import { RequirementsService } from './requirements.service';

@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
@Controller('workspaces/:workspaceId/requirements')
export class RequirementsController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Post()
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_CREATE)
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateRequirementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.requirementsService.create(workspaceId, dto, user.userId);
  }

  @Get()
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.requirementsService.findAll(workspaceId);
  }

  @Get(':requirementId')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findById(
    @Param('workspaceId') workspaceId: string,
    @Param('requirementId', ParseObjectIdPipe) requirementId: string,
  ) {
    return this.requirementsService.findById(workspaceId, requirementId);
  }

  @Post(':requirementId/archive')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_ARCHIVE)
  archive(
    @Param('workspaceId') workspaceId: string,
    @Param('requirementId', ParseObjectIdPipe) requirementId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.requirementsService.archive(
      workspaceId,
      requirementId,
      user.userId,
    );
  }
}
