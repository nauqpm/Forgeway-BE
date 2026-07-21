import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ImportCsvConfirmDto {
  @ApiProperty({
    description: 'JWT session token nhận được từ bước /preview (TTL 10 phút)',
  })
  @IsString()
  @IsNotEmpty()
  sessionToken!: string;
}
