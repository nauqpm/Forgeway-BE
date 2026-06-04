import { IsMongoId } from 'class-validator';

export class JoinPageRoomDto {
  @IsMongoId()
  pageId!: string;
}
