import { IsMongoId, IsString } from 'class-validator';

export class PageUpdateDto {
  @IsMongoId()
  pageId!: string;

  @IsString()
  update!: string;
}
