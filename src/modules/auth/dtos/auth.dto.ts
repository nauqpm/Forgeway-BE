import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsIn,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { EMAIL_POLICY } from '../../../common/constants/email-policy.constants';
import { PASSWORD_POLICY } from '../../../common/constants/password-policy.constants';

export class RegisterDto {
  @ApiProperty({
    description: 'User email',
    example: 'user@example.com',
  })
  @IsNotEmpty({ message: 'Email cannot be empty.' })
  @Matches(EMAIL_POLICY.pattern, {
    message: EMAIL_POLICY.message,
  })
  @IsEmail({}, { message: EMAIL_POLICY.message })
  email!: string;

  @ApiProperty({
    description: 'Password',
    example: 'Password123!',
  })
  @IsNotEmpty({ message: 'Password cannot be empty.' })
  @Matches(PASSWORD_POLICY.noWhitespacePattern, {
    message: PASSWORD_POLICY.noWhitespaceMessage,
  })
  @Matches(PASSWORD_POLICY.pattern, { message: PASSWORD_POLICY.message })
  password!: string;
}

export class LoginDto {
  @ApiProperty({
    description: 'User email',
    example: 'user@example.com',
  })
  @IsNotEmpty({ message: 'Email cannot be empty.' })
  @Matches(EMAIL_POLICY.pattern, {
    message: EMAIL_POLICY.message,
  })
  @IsEmail({}, { message: EMAIL_POLICY.message })
  email!: string;

  @ApiProperty({
    description: 'Password',
    example: 'Password123!',
  })
  @IsNotEmpty({ message: 'Password cannot be empty.' })
  password!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Full name',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString({ message: 'Full name must be a string.' })
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Email',
    example: 'user@example.com',
  })
  @IsOptional()
  @Matches(EMAIL_POLICY.pattern, {
    message: EMAIL_POLICY.message,
  })
  @IsEmail({}, { message: EMAIL_POLICY.message })
  email?: string;

  @ApiPropertyOptional({
    description: 'New password',
    example: 'NewPassword123!',
  })
  @IsOptional()
  @Matches(PASSWORD_POLICY.noWhitespacePattern, {
    message: PASSWORD_POLICY.noWhitespaceMessage,
  })
  @Matches(PASSWORD_POLICY.pattern, { message: PASSWORD_POLICY.message })
  password?: string;

  @ApiPropertyOptional({
    description: 'Avatar image URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString({ message: 'Avatar URL must be a string.' })
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '0123456789',
  })
  @IsOptional()
  @IsString({ message: 'Phone number must be a string.' })
  phoneNumber?: string;
}

export class UpdateUserDto extends UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'User role',
    enum: Object.values(GLOBAL_ROLES),
    example: GLOBAL_ROLES.USER,
  })
  @IsOptional()
  @IsString({ message: 'Role must be a string.' })
  @IsIn(Object.values(GLOBAL_ROLES), {
    message: 'Role must be one of the following values: super_admin, user',
  })
  role?: string;
}

export class VerifyEmailDto {
  @ApiProperty({
    description: 'User email',
    example: 'user@example.com',
  })
  @IsNotEmpty({ message: 'Email cannot be empty.' })
  @Matches(EMAIL_POLICY.pattern, {
    message: EMAIL_POLICY.message,
  })
  @IsEmail({}, { message: EMAIL_POLICY.message })
  email!: string;

  @ApiProperty({
    description: 'Email verification code',
    example: '123456',
  })
  @IsNotEmpty({ message: 'Verification code cannot be empty.' })
  code!: string;
}

export class ResendVerificationDto {
  @ApiProperty({
    description: 'User email',
    example: 'user@example.com',
  })
  @IsNotEmpty({ message: 'Email cannot be empty.' })
  @Matches(EMAIL_POLICY.pattern, {
    message: EMAIL_POLICY.message,
  })
  @IsEmail({}, { message: EMAIL_POLICY.message })
  email!: string;
}
