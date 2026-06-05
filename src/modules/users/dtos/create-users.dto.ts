import { IsString, IsEmail, IsOptional, IsEnum, IsUrl, Matches, IsNotEmpty } from 'class-validator';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';

import { PASSWORD_POLICY } from '../../../common/constants/password-policy.constants';

// 📄 DTO cho tạo người dùng mới
export class CreateUsersDto {
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(PASSWORD_POLICY.pattern, { message: PASSWORD_POLICY.message })
  password!: string;

  @IsOptional()
  @IsString()
  googleId?: string;

  @IsOptional()
  @IsString()
  @IsEnum(Object.values(GLOBAL_ROLES), {
    message: 'Role không hợp lệ',
  })
  role?: string = GLOBAL_ROLES.USER;

  @IsOptional()
  @IsString()
  @IsEnum(Object.values(USER_STATUSES), {
    message: 'Trạng thái không hợp lệ',
  })
  status?: string = USER_STATUSES.PENDING_VERIFICATION;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  birthday?: string;

  @IsOptional()
  @IsString()
  @IsEnum(['male', 'female', 'other'], {
    message: 'Giới tính không hợp lệ',
  })
  gender?: string;

  @IsOptional()
  @IsUrl()
  avatar?: string;
}
