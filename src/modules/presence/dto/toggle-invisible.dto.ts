import { IsBoolean } from 'class-validator';

export class ToggleInvisibleDto {
  @IsBoolean()
  invisible!: boolean;
}
