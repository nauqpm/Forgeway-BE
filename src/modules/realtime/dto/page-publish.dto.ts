// dto/page-publish.dto.ts
import { IsMongoId } from 'class-validator';

export class PagePublishDto {
  @IsMongoId()
  pageId!: string;
}
