import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DeleteTaskDto {
  @ApiProperty({ example: 'delete' })
  @IsOptional()
  @IsString()
  confirmText?: string;
}
