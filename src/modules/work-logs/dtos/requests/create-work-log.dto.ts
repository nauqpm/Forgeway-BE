import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWorkLogDto {
  /**
   * Số giờ đã làm việc trong lần log này.
   * FE gửi dạng số thực.
   */
  @ApiPropertyOptional({
    description: 'Hours spent in this log session (e.g. 1.5, 4.5)',
    example: 4.5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999)
  hoursSpent?: number;

  /**
   * Thời gian ước lượng còn lại, tính bằng GIỜ.
   * FE gửi số thực (1, 1.5, 6).
   */
  @ApiPropertyOptional({
    description: 'Remaining estimated time in HOURS (e.g. 6 or 1.5)',
    example: 6.5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(9999)
  timeEstimated?: number;

  /**
   * Mô tả công việc đã thực hiện (hỗ trợ Markdown).
   */
  @ApiPropertyOptional({
    description: 'Description of work done (supports Markdown)',
    example: '- Implemented login feature\n- Fixed auth bug',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /**
   * Thời điểm thực tế thực hiện công việc (ISO 8601).
   * Nếu không gửi, mặc định = thời điểm gọi API.
   */
  @ApiPropertyOptional({
    description: 'Actual date/time when the work was done (ISO 8601)',
    example: '2026-07-03T09:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  loggedAt?: string;
}
