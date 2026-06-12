import { IsArray, IsMongoId } from 'class-validator';

export class PageAwarenessUpdateDto {
  @IsMongoId()
  pageId!: string;

  @IsArray()
  update!: number[];
}
