import { IsArray, IsMongoId } from 'class-validator';

export class PageYjsUpdateDto {
  @IsMongoId()
  pageId!: string;

  /** Yjs incremental update — transmitted as number[] for JSON safety */
  @IsArray()
  update!: number[];
}
