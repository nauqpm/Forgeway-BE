import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  ReorderWorkspacesDto,
  SetWorkspaceStarDto,
} from '../dtos/workspace-preference.dto';
import { WorkspacePreferencesService } from '../services/workspace-preferences.service';

@Controller('workspace-preferences')
@UseGuards(JwtAuthGuard)
export class WorkspacePreferencesController {
  constructor(
    private readonly preferencesService: WorkspacePreferencesService,
  ) {}

  @Get()
  findMine(@Request() req: any) {
    return this.preferencesService.findByUserId(req.user.userId);
  }

  @Put('order')
  async reorder(@Request() req: any, @Body() dto: ReorderWorkspacesDto) {
    await this.preferencesService.reorder(req.user.userId, dto.workspaceIds);
    return { success: true };
  }

  @Put(':workspaceId/star')
  setStar(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: SetWorkspaceStarDto,
  ) {
    return this.preferencesService.setStar(
      req.user.userId,
      workspaceId,
      dto.isStarred,
    );
  }
}
