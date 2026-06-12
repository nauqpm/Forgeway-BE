import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LabelDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  isDeleted!: boolean;

  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiPropertyOptional()
  updatedAt?: Date;
}
