import {
  Body,
  Controller,
  Delete,
  HttpStatus,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UpdateTaskLabelsDto } from '../dtos/requests/task-action.dto';
import { TaskDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TasksRepository } from '../repositories/tasks.repository';

@ApiTags('Task Labels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks/:id/labels')
export class TaskLabelsController {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly taskMapper: TaskMapper,
  ) {}

  @Put()
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Update task labels (replace all)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Labels updated',
    type: TaskDto,
  })
  async updateLabels(
    @Param('id') id: string,
    @Body() dto: UpdateTaskLabelsDto,
  ): Promise<TaskDto> {
    const existing = await this.tasksRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const existingLabels = existing.labels || [];

    for (const label of existingLabels) {
      if (!dto.labels.includes(label)) {
        await this.tasksRepository.removeLabel(id, label);
      }
    }

    for (const label of dto.labels) {
      if (!existingLabels.includes(label)) {
        await this.tasksRepository.addLabel(id, label);
      }
    }

    const updated = await this.tasksRepository.findById(id);
    if (!updated) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return this.taskMapper.mapToDto(updated);
  }

  @Put(':label')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Add a label to task' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Label added',
    type: TaskDto,
  })
  async addLabel(
    @Param('id') id: string,
    @Param('label') label: string,
  ): Promise<TaskDto> {
    const updated = await this.tasksRepository.addLabel(id, label);
    if (!updated) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return this.taskMapper.mapToDto(updated);
  }

  @Delete(':label')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Remove a label from task' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Label removed',
    type: TaskDto,
  })
  async removeLabel(
    @Param('id') id: string,
    @Param('label') label: string,
  ): Promise<TaskDto> {
    const updated = await this.tasksRepository.removeLabel(id, label);
    if (!updated) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return this.taskMapper.mapToDto(updated);
  }
}
