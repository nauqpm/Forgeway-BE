import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';
import { PASSWORD_POLICY } from '../../../common/constants/password-policy.constants';

export class RequestPasswordResetDto {
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @IsNotEmpty({ message: 'Email không được để trống.' })
  email!: string;
}

export class ResetPasswordWithGrantDto {
  @IsString({ message: 'Reset grant phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Reset grant không được để trống.' })
  resetGrant!: string;

  @IsString({ message: 'ật khẩu mới phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'ật khẩu mới không được để trống.' })
  @Matches(PASSWORD_POLICY.pattern, { message: PASSWORD_POLICY.message })
  newPassword!: string;
}

export class VerifyOtpDto {
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @IsNotEmpty({ message: 'Email không được để trống.' })
  email!: string;

  @IsString({ message: 'OTP phải là chuỗi ký tự.' })
  @Matches(/^\d{6}$/, { message: 'OTP phai gom dung 6 chu so.' })
  otp!: string;
}
