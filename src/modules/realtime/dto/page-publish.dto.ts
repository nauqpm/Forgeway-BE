// dto/page-publish.dto.ts
import { IsMongoId, IsString } from 'class-validator';

export class PagePublishDto {
  @IsMongoId()
  pageId!: string;

  @IsString()
  title!: string;

  @IsString()
  content!: string;
}
