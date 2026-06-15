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
import { EMAIL_POLICY } from '../../../common/constants/email-policy.constants';
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
  @IsEmail({}, { message: 'Invalid email address' })
  @Matches(EMAIL_POLICY.noWhitespacePattern, {
    message: EMAIL_POLICY.noWhitespaceMessage,
  })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(8, 100)
  @Matches(PASSWORD_POLICY.noWhitespacePattern, {
    message: PASSWORD_POLICY.noWhitespaceMessage,
  })
  @Matches(PASSWORD_POLICY.pattern, {
    message: PASSWORD_POLICY.message,
  })
  password?: string;

  @IsOptional()
  @IsEnum(Object.values(GLOBAL_ROLES), {
    message: 'Invalid role',
  })
  role?: string;

  @IsOptional()
  @IsMongoId({
    message: 'roleId must be a valid MongoId',
  })
  roleId?: Types.ObjectId;

  @IsOptional()
  @IsEnum(Object.values(USER_STATUSES), {
    message: 'Invalid status',
  })
  status?: string;

  @IsOptional()
  @Matches(/^(\+?[1-9]\d{7,14}|0\d{9,10})$/, {
    message: 'Invalid phone number',
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
      message: 'Invalid date of birth',
    },
  )
  birthday?: string;

  @IsOptional()
  @IsEnum(['male', 'female', 'other'], {
    message: 'Invalid gender',
  })
  gender?: 'male' | 'female' | 'other';

  @IsOptional()
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: false, // Allow localhost
    },
    {
      message: 'Avatar must be a valid URL',
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
