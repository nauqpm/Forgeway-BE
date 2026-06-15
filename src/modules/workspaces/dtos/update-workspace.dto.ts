import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsObject,
  IsUrl,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWorkspaceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example:
      'https://res.cloudinary.com/sdlcplatform/image/upload/sdlc-platform/sample%20avater%20workspace/viewavatar-1.png',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  avatar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;
}
