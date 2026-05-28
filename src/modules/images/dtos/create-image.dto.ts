import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';

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
  targetId?: string;

}
