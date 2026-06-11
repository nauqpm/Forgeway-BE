import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { CreateLabelDto } from '../dtos/create-label.dto';
import { LabelDto } from '../dtos/label.dto';
import { UpdateLabelDto } from '../dtos/update-label.dto';
import { LabelService } from '../services/label.service';

@ApiTags('Labels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/labels')
export class LabelsController {
  constructor(private readonly labelService: LabelService) {}

  @Post()
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Create a workspace label' })
  @ApiResponse({ status: HttpStatus.CREATED, type: LabelDto })
  @ApiBadRequestResponse({ description: 'Invalid workspace ID or payload' })
  @ApiConflictResponse({
    description: 'Label name already exists in workspace',
  })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  async createLabel(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateLabelDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<LabelDto> {
    return this.labelService.create(workspaceId, dto, user.userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
  @ApiOperation({ summary: 'List workspace labels' })
  @ApiResponse({ status: HttpStatus.OK, type: [LabelDto] })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  async getLabels(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<LabelDto[]> {
    return this.labelService.findByWorkspace(workspaceId, user.userId);
  }

  @Patch(':labelId')
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Update a workspace label' })
  @ApiResponse({ status: HttpStatus.OK, type: LabelDto })
  @ApiBadRequestResponse({ description: 'Invalid IDs or payload' })
  @ApiConflictResponse({
    description: 'Label name already exists in workspace',
  })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Workspace or label not found' })
  async updateLabel(
    @Param('workspaceId') workspaceId: string,
    @Param('labelId') labelId: string,
    @Body() dto: UpdateLabelDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<LabelDto> {
    return this.labelService.update(workspaceId, labelId, dto, user.userId);
  }

  @Delete(':labelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, ScopedRoleGuard('workspace', SPACE_ROLES.MEMBER))
  @ApiOperation({
    summary: 'Soft delete a workspace label and remove it from tasks',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiBadRequestResponse({ description: 'Invalid IDs' })
  @ApiForbiddenResponse({ description: 'Workspace access denied' })
  @ApiNotFoundResponse({ description: 'Workspace or label not found' })
  async deleteLabel(
    @Param('workspaceId') workspaceId: string,
    @Param('labelId') labelId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.labelService.delete(workspaceId, labelId, user.userId);
  }
}
