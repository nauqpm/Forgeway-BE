import { IsString, MaxLength, IsEnum, IsOptional, IsMongoId, IsArray, IsNumber } from 'class-validator';

export class AttachmentDto {
  @IsString() url!: string;
  @IsString() name!: string;
  @IsNumber() size!: number;
  @IsString() mimeType!: string;
}

export class SendMessageDto {
  @IsString() @MaxLength(4000) content!: string;
  @IsEnum(['text', 'file', 'image']) @IsOptional() type?: string;
  @IsMongoId() @IsOptional() replyToId?: string;
  @IsArray() @IsOptional() attachments?: AttachmentDto[];
}
