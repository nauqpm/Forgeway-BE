import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_POLICY } from '../../../common/constants/password-policy.constants';

export class RequestPasswordResetDto {
  @ApiProperty({
    description: 'Email của người dùng để yêu cầu đặt lại mật khẩu',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @IsNotEmpty({ message: 'Email không được để trống.' })
  email!: string;
}

export class ResetPasswordWithGrantDto {
  @ApiProperty({
    description: 'Grant token để đặt lại mật khẩu',
    example: 'eyJhbGciOiJIUzI1...',
  })
  @IsString({ message: 'Reset grant phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Reset grant không được để trống.' })
  resetGrant!: string;

  @ApiProperty({
    description: 'Mật khẩu mới',
    example: 'NewPassword123!',
  })
  @IsString({ message: 'ật khẩu mới phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'ật khẩu mới không được để trống.' })
  @Matches(PASSWORD_POLICY.pattern, { message: PASSWORD_POLICY.message })
  newPassword!: string;
}

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Email của người dùng',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @IsNotEmpty({ message: 'Email không được để trống.' })
  email!: string;

  @ApiProperty({
    description: 'Mã OTP (6 chữ số)',
    example: '123456',
  })
  @IsString({ message: 'OTP phải là chuỗi ký tự.' })
  @Matches(/^\d{6}$/, { message: 'OTP phai gom dung 6 chu so.' })
  otp!: string;
}
