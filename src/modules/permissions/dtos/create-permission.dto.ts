import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePermissionDto {
  @IsNotEmpty()
  @IsString()
  resource!: string;

  @IsNotEmpty()
  @IsString()
  action!: string;
}
