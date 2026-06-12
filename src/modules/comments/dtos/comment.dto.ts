import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CommentAuthorDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  fullName?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  avatar?: string;
}

export class CommentDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  workspaceId?: string;

  @ApiProperty()
  content!: string;

  @ApiProperty()
  authorId!: string;

  @ApiPropertyOptional({ type: CommentAuthorDto })
  author?: CommentAuthorDto;

  @ApiProperty({ enum: ['task', 'page'] })
  targetType!: string;

  @ApiProperty()
  targetId!: string;

  @ApiPropertyOptional()
  parentId?: string;

  @ApiPropertyOptional()
  inlineId?: string;

  @ApiProperty({ type: [String] })
  mentions!: string[];

  @ApiProperty()
  isDeleted!: boolean;

  @ApiProperty()
  isResolved!: boolean;

  @ApiPropertyOptional()
  resolvedBy?: string;

  @ApiPropertyOptional()
  resolvedAt?: Date;

  @ApiPropertyOptional()
  editedAt?: Date;

  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiPropertyOptional()
  updatedAt?: Date;

  @ApiPropertyOptional({ type: [CommentDto] })
  replies?: CommentDto[];
}
