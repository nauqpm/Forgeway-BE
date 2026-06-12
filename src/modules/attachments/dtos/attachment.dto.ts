import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttachmentUserDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  fullName?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  avatar?: string;
}

export class AttachmentDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  workspaceId?: string;

  @ApiProperty()
  originalName!: string;

  @ApiProperty()
  filename!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  size!: number;

  @ApiProperty()
  targetType!: string;

  @ApiProperty()
  targetId!: string;

  @ApiProperty()
  uploadedBy!: string;

  @ApiPropertyOptional({ type: AttachmentUserDto })
  uploader?: AttachmentUserDto;

  @ApiProperty()
  downloadCount!: number;

  @ApiProperty()
  isDeleted!: boolean;

  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiPropertyOptional()
  updatedAt?: Date;
}
