import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EMAIL_POLICY } from '../../../common/constants/email-policy.constants';
import { PASSWORD_POLICY } from '../../../common/constants/password-policy.constants';

export class RequestPasswordResetDto {
  @ApiProperty({
    description: 'User email for requesting a password reset',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Invalid email address.' })
  @Matches(EMAIL_POLICY.noWhitespacePattern, {
    message: EMAIL_POLICY.noWhitespaceMessage,
  })
  @IsNotEmpty({ message: 'Email must not be empty.' })
  email!: string;
}

export class ResetPasswordWithGrantDto {
  @ApiProperty({
    description: 'Grant token used to reset the password',
    example: 'eyJhbGciOiJIUzI1...',
  })
  @IsString({ message: 'Reset grant must be a string.' })
  @IsNotEmpty({ message: 'Reset grant must not be empty.' })
  resetGrant!: string;

  @ApiProperty({
    description: 'New password',
    example: 'NewPassword123!',
  })
  @IsString({ message: 'New password must be a string.' })
  @IsNotEmpty({ message: 'New password must not be empty.' })
  @Matches(PASSWORD_POLICY.noWhitespacePattern, {
    message: PASSWORD_POLICY.noWhitespaceMessage,
  })
  @Matches(PASSWORD_POLICY.pattern, { message: PASSWORD_POLICY.message })
  newPassword!: string;
}

export class VerifyOtpDto {
  @ApiProperty({
    description: 'User email',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Invalid email address.' })
  @Matches(EMAIL_POLICY.noWhitespacePattern, {
    message: EMAIL_POLICY.noWhitespaceMessage,
  })
  @IsNotEmpty({ message: 'Email must not be empty.' })
  email!: string;

  @ApiProperty({
    description: 'OTP code (6 digits)',
    example: '123456',
  })
  @IsString({ message: 'OTP must be a string.' })
  @Matches(/^\d{6}$/, { message: 'OTP must contain exactly 6 digits.' })
  otp!: string;
}
