import { IsMongoId, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class CursorPaginationDto {
  @IsMongoId() @IsOptional() cursor?: string;
  @IsNumber() @Min(1) @Max(100) @IsOptional() limit?: number;
}
