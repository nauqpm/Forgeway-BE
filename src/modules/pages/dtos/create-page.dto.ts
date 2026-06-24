import {
  IsString,
  IsOptional,
  IsArray,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePageDto {
  @ApiProperty({
    example: 'Getting Started Guide',
    description: 'Page title. Max 255 characters.',
  })
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({
    description:
      'Page body as raw HTML produced by TipTap `editor.getHTML()`. ' +
      'Stored as-is; no server-side sanitization is applied.',
    example: '<h1>Hello</h1><p>World</p>',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'MongoDB ObjectId of the owning workspace.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @ApiPropertyOptional({
    description:
      'ObjectId of the parent page. Omit or set null for a root page.',
    example: '665f1a2b3c4d5e6f7a8b9c0e',
  })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({
    description:
      'URL-friendly slug. Only lowercase letters, digits, and hyphens. ' +
      'Auto-generated from title if omitted.',
    example: 'getting-started-guide',
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Arbitrary string labels / tags.',
    example: ['onboarding', 'frontend'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];
}
