import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsObject,
  IsEnum,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'AL - Tasks' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'Jira space for my team' })
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

  @ApiPropertyOptional({ example: 'my-company' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  slug?: string;

  @ApiPropertyOptional({ example: 'SCRUM' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  key?: string;

  @ApiPropertyOptional({ enum: ['scrum', 'kanban'], default: 'kanban' })
  @IsOptional()
  @IsEnum(['scrum', 'kanban'])
  type?: string;

  @ApiPropertyOptional({ enum: ['private', 'public'], default: 'public' })
  @IsOptional()
  @IsEnum(['private', 'public'])
  access?: string;
}

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

  @ApiPropertyOptional({ example: 'SCRUM' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  key?: string;

  @ApiPropertyOptional({ enum: ['scrum', 'kanban'] })
  @IsOptional()
  @IsEnum(['scrum', 'kanban'])
  type?: string;

  @ApiPropertyOptional({ enum: ['active', 'archived'] })
  @IsOptional()
  @IsEnum(['active', 'archived'])
  status?: string;

  @ApiPropertyOptional({ enum: ['private', 'public'] })
  @IsOptional()
  @IsEnum(['private', 'public'])
  access?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string;
}
