import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';

export class CreateInviteDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsEnum(SPACE_ROLES, {
    message: `role phải là một trong: ${Object.values(SPACE_ROLES).join(', ')}`,
  })
  @IsOptional()
  role?: string;
}
