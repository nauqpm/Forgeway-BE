import { IsString, IsEmail, IsOptional, IsEnum, IsUrl, Matches, IsMongoId } from 'class-validator';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { Types } from 'mongoose';

import { PASSWORD_POLICY } from '../../../common/constants/password-policy.constants';

// 📄 DTO cho cập nhật thông tin người dùng
export class UpdateUsersDto {
  @IsOptional()
  @IsString()
  googleId?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(PASSWORD_POLICY.pattern, { message: PASSWORD_POLICY.message })
  password?: string;

  @IsOptional()
  @IsString()
  @IsEnum(Object.values(GLOBAL_ROLES), {
    message: 'Role không hợp lệ',
  })
  role?: string;

  @IsOptional()
  @IsMongoId()
  roleId?: Types.ObjectId;

  @IsOptional()
  @IsString()
  @IsEnum(['active', 'inactive', 'banned'], {
    message: 'Trạng thái không hợp lệ',
  })
  status?: string;

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

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(PASSWORD_POLICY.pattern, { message: PASSWORD_POLICY.message })
  password?: string;

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
    message: 'Giá»›i tÃ­nh khÃ´ng há»£p lá»‡',
  })
  gender?: string;

  @IsOptional()
  @IsUrl()
  avatar?: string;
}
