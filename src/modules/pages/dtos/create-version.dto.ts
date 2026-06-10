import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVersionDto {
  @ApiProperty({
    example: 'Bản thảo lần 1',
    description: 'Tên phiên bản do người dùng đặt. Tối đa 100 ký tự.',
  })
  @IsString()
  @MaxLength(100)
  label!: string;
}
