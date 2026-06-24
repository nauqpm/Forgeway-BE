import { BadRequestException, Injectable } from '@nestjs/common';
import { TASK_COVER_TYPES } from '../constants/task-cover.constants';
import { SetTaskCoverDto } from '../dtos/set-task-cover.dto';
import { TaskCover } from '../interfaces/task-cover.interface';

@Injectable()
export class TaskCoverMapper {
  mapInputToCover(dto: SetTaskCoverDto, userId: string): TaskCover {
    if (dto.type === TASK_COVER_TYPES.COLOR) {
      if (!dto.color) {
        throw new BadRequestException('color is required for color cover');
      }

      return {
        type: TASK_COVER_TYPES.COLOR,
        color: dto.color,
        source: dto.source,
        updatedBy: userId,
        updatedAt: new Date(),
      };
    }

    if (dto.type === TASK_COVER_TYPES.IMAGE) {
      if (!dto.imageUrl) {
        throw new BadRequestException('imageUrl is required for image cover');
      }

      return {
        type: TASK_COVER_TYPES.IMAGE,
        imageUrl: dto.imageUrl,
        source: dto.source,
        updatedBy: userId,
        updatedAt: new Date(),
      };
    }

    throw new BadRequestException('Unsupported task cover type');
  }

  mapToDto(cover?: TaskCover | null): TaskCover | null {
    if (!cover) {
      return null;
    }

    return {
      type: cover.type,
      color: cover.color,
      imageUrl: cover.imageUrl,
      source: cover.source,
      updatedBy: this.toOptionalId(cover.updatedBy),
      updatedAt: cover.updatedAt,
    };
  }

  private toOptionalId(value: unknown): string | undefined {
    if (!value) {
      return undefined;
    }
    if (typeof value === 'object' && '_id' in value) {
      return String(value._id);
    }
    return String(value);
  }
}
