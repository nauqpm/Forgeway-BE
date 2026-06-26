import { IsString, IsOptional } from 'class-validator';

export enum ImageType {
  POST = 'post',
  PROPERTY = 'property',
  AVATAR = 'avatar',
  OTHER = 'other',
}

export class CreateImageDto {
  @IsOptional()
  @IsString()
  type?: ImageType;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  workspaceName?: string;

  @IsOptional()
  @IsString()
  targetName?: string;
}
