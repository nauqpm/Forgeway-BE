import { IsMongoId } from 'class-validator';

export class LeavePageRoomDto {
  @IsMongoId()
  pageId!: string;
}
