import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterDeviceTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional({ example: 'android' })
  @IsString()
  @IsOptional()
  platform?: string;
}
