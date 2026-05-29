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

  @ApiProperty({ type: [String] })
  mentions!: string[];

  @ApiProperty()
  isDeleted!: boolean;

  @ApiPropertyOptional()
  editedAt?: Date;

  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiPropertyOptional()
  updatedAt?: Date;
}