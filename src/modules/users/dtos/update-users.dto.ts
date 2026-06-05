import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsUrl,
  Matches,
  IsMongoId,
  IsDateString,
  Length,
  MaxLength,
} from 'class-validator';

import { Types } from 'mongoose';

import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { PASSWORD_POLICY } from '../../../common/constants/password-policy.constants';
import { OmitType } from '@nestjs/swagger';

export class UpdateUsersDto {
  @IsOptional()
  @IsString()
  @Length(5, 100)
  googleId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  fullName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(8, 100)
  @Matches(PASSWORD_POLICY.pattern, {
    message: PASSWORD_POLICY.message,
  })
  password?: string;

  @IsOptional()
  @IsEnum(Object.values(GLOBAL_ROLES), {
    message: 'Role không hợp lệ',
  })
  role?: string;

  @IsOptional()
  @IsMongoId({
    message: 'roleId không phải MongoId hợp lệ',
  })
  roleId?: Types.ObjectId;

  @IsOptional()
  @IsEnum(Object.values(USER_STATUSES), {
    message: 'Trạng thái không hợp lệ',
  })
  status?: string;

  @IsOptional()
  @Matches(/^(\+?[1-9]\d{7,14}|0\d{9,10})$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsDateString(
    {},
    {
      message: 'Ngày sinh không hợp lệ',
    },
  )
  birthday?: string;

  @IsOptional()
  @IsEnum(['male', 'female', 'other'], {
    message: 'Giới tính không hợp lệ',
  })
  gender?: 'male' | 'female' | 'other';

  @IsOptional()
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: false, // Thêm dòng này để cho phép localhost
    },
    {
      message: 'Avatar phải là URL hợp lệ',
    },
  )
  avatar?: string;

  @IsOptional()
  @IsString()
  currentPassword?: string;
}

export class UpdateUserProfileDto extends OmitType(UpdateUsersDto, [
  'googleId',
  'role',
  'roleId',
  'status',
] as const) {}
