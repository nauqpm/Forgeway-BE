import { IsArray, IsMongoId, IsNotEmpty } from 'class-validator';

export class UpdateUserPermissionsDto {
  @IsNotEmpty()
  @IsMongoId()
  userId!: string;

  @IsArray()
  @IsMongoId({ each: true })
  permissionIds!: string[];
}
