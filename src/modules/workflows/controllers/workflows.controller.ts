import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { WorkflowsService } from '../services/workflows.service';
import { CreateWorkflowDto } from '../dtos/create-workflow.dto';
import { UpdateWorkflowDto } from '../dtos/update-workflow.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';

@ApiTags('Workflows')
@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  @ApiOperation({ summary: 'List all workflows or filter by workspaceId' })
  @ApiQuery({
    name: 'workspaceId',
    required: false,
    description: 'Filter workflows by Workspace ID',
  })
  @ApiResponse({ status: 200, description: 'List of workflows' })
  async findAll(@Query('workspaceId') workspaceId?: string) {
    if (workspaceId) {
      return this.workflowsService
        .findByWorkspace(workspaceId)
        .then(w => (w ? [w] : []));
    }
    return [];
  }

  @Get(':id')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  @ApiOperation({ summary: 'Get workflow by ID' })
  @ApiParam({ name: 'id', description: 'Workflow ID' })
  @ApiResponse({ status: 200, description: 'Workflow details' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  async findOne(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    return this.workflowsService.findById(id, workspaceId);
  }

  @Post()
  @RequirePermissions(WORKSPACE_PERMISSIONS.WORKSPACE_UPDATE)
  @ApiOperation({ summary: 'Create a new workflow' })
  @ApiResponse({ status: 201, description: 'Workflow created successfully' })
  @ApiResponse({
    status: 409,
    description: 'Workflow already exists for this Workspace',
  })
  async create(@Body() dto: CreateWorkflowDto & { workspaceId: string }) {
    return this.workflowsService.create(dto);
  }

  @Put(':id')
  @RequirePermissions(WORKSPACE_PERMISSIONS.WORKSPACE_UPDATE)
  @ApiOperation({ summary: 'Update a workflow' })
  @ApiParam({ name: 'id', description: 'Workflow ID' })
  @ApiResponse({ status: 200, description: 'Workflow updated successfully' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
    @Query('workspaceId') workspaceId: string,
  ) {
    return this.workflowsService.update(id, dto, workspaceId);
  }

  @Delete(':id')
  @RequirePermissions(WORKSPACE_PERMISSIONS.WORKSPACE_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a workflow' })
  @ApiParam({ name: 'id', description: 'Workflow ID' })
  @ApiResponse({ status: 204, description: 'Workflow deleted successfully' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  async delete(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    await this.workflowsService.delete(id, workspaceId);
  }

  @Get('workspace/:workspaceId')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  @ApiOperation({ summary: 'Get workflow for a specific workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({ status: 200, description: 'Workflow for the Workspace' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  async findByWorkspace(@Param('workspaceId') workspaceId: string) {
    const workflow = await this.workflowsService.findByWorkspace(workspaceId);
    if (!workflow) {
      return null;
    }
    return workflow;
  }

  @Get(':id/transitions/:fromStatus')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  @ApiOperation({ summary: 'Get valid next statuses from a given status' })
  @ApiParam({ name: 'id', description: 'Workflow ID' })
  @ApiParam({ name: 'fromStatus', description: 'Current status ID' })
  @ApiResponse({ status: 200, description: 'List of valid transitions' })
  async getNextStatuses(
    @Param('id') id: string,
    @Param('fromStatus') fromStatus: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    if (!fromStatus) {
      return [];
    }
    return this.workflowsService.getNextStatuses(id, fromStatus, workspaceId);
  }

  @Post('default/:workspaceId')
  @RequirePermissions(WORKSPACE_PERMISSIONS.WORKSPACE_UPDATE)
  @ApiOperation({ summary: 'Create a default workflow for a Workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({ status: 201, description: 'Default workflow created' })
  @ApiResponse({
    status: 409,
    description: 'Workflow already exists for this Workspace',
  })
  async createDefault(@Param('workspaceId') workspaceId: string) {
    return this.workflowsService.createDefaultWorkflow(workspaceId);
  }
}
