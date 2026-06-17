import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsMongoId,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty()
  @IsMongoId()
  workspaceId!: string;

  @ApiProperty()
  @IsString()
  content!: string;

  @ApiProperty({ enum: ['task', 'page'] })
  @IsEnum(['task', 'page'])
  targetType!: string;

  @ApiProperty()
  @IsString()
  targetId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inlineId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  mentions?: string[];
}
