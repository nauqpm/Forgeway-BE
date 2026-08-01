import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsIn,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateRequirementDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  key!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  title!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(10000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  body!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @IsIn(['manual', 'jira'])
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  sourceType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceRef?: string;

  @IsOptional()
  @IsObject()
  sourceMetadata?: Record<string, unknown>;
}
