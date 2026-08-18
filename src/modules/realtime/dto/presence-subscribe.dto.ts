import { IsArray, IsMongoId } from 'class-validator';

export class PresenceSubscribeDto {
  @IsArray()
  @IsMongoId({ each: true })
  userIds!: string[];
}
