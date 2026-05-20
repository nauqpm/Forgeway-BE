import {
  Body,
  Controller,
  Delete,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TaskDto } from '../dtos/responses/task.dto';
import { TaskMapper } from '../mappers/task.mapper';
import { TasksRepository } from '../repositories/tasks.repository';

export class TaskAttachmentDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  url!: string;

  @ApiProperty()
  @IsNumber()
  size!: number;

  @ApiProperty()
  @IsString()
  mimeType!: string;
}

@ApiTags('Task Attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks/:id/attachments')
export class TaskAttachmentsController {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly taskMapper: TaskMapper,
  ) {}

  @Post()
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Add attachment to task' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Attachment added',
    type: TaskDto,
  })
  async addAttachment(
    @Param('id') id: string,
    @Body() attachment: TaskAttachmentDto,
  ): Promise<TaskDto> {
    const updated = await this.tasksRepository.addAttachment(id, attachment);
    if (!updated) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return this.taskMapper.mapToDto(updated);
  }

  @Delete(':attachmentId')
  @UseGuards(ScopedRoleGuard('task', SPACE_ROLES.MEMBER))
  @ApiOperation({ summary: 'Remove attachment from task' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Attachment removed',
    type: TaskDto,
  })
  async removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<TaskDto> {
    const updated = await this.tasksRepository.removeAttachment(
      id,
      attachmentId,
    );
    if (!updated) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return this.taskMapper.mapToDto(updated);
  }
}
