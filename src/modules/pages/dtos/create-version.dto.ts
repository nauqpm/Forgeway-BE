import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVersionDto {
  @ApiProperty({
    example: 'Draft 1',
    description: 'Version name defined by user. Max 100 characters.',
  })
  @IsString()
  @MaxLength(100)
  label!: string;
}
