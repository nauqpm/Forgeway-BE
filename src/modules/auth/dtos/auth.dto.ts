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
    description: 'Email của người dùng',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @Matches(EMAIL_POLICY.noWhitespacePattern, {
    message: EMAIL_POLICY.noWhitespaceMessage,
  })
  @IsNotEmpty({ message: 'Email không được để trống.' })
  email!: string;

  @ApiProperty({
    description: 'Mật khẩu',
    example: 'Password123!',
  })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống.' })
  @Matches(PASSWORD_POLICY.noWhitespacePattern, {
    message: PASSWORD_POLICY.noWhitespaceMessage,
  })
  @Matches(PASSWORD_POLICY.pattern, { message: PASSWORD_POLICY.message })
  password!: string;
}

export class LoginDto {
  @ApiProperty({
    description: 'Email của người dùng',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @Matches(EMAIL_POLICY.noWhitespacePattern, {
    message: EMAIL_POLICY.noWhitespaceMessage,
  })
  email!: string;

  @ApiProperty({
    description: 'Mật khẩu',
    example: 'Password123!',
  })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống.' })
  password!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Tên đầy đủ',
    example: 'Nguyễn Văn A',
  })
  @IsOptional()
  @IsString({ message: 'Tên đầy đủ phải là chuỗi ký tự.' })
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Email',
    example: 'user@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @Matches(EMAIL_POLICY.noWhitespacePattern, {
    message: EMAIL_POLICY.noWhitespaceMessage,
  })
  email?: string;

  @ApiPropertyOptional({
    description: 'Mật khẩu mới',
    example: 'NewPassword123!',
  })
  @IsOptional()
  @Matches(PASSWORD_POLICY.noWhitespacePattern, {
    message: PASSWORD_POLICY.noWhitespaceMessage,
  })
  @Matches(PASSWORD_POLICY.pattern, { message: PASSWORD_POLICY.message })
  password?: string;

  @ApiPropertyOptional({
    description: 'URL của ảnh đại diện',
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString({ message: 'URL avatar phải là chuỗi ký tự.' })
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Số điện thoại',
    example: '0123456789',
  })
  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự.' })
  phoneNumber?: string;
}

export class UpdateUserDto extends UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Quyền của người dùng',
    enum: Object.values(GLOBAL_ROLES),
    example: GLOBAL_ROLES.USER,
  })
  @IsOptional()
  @IsString({ message: 'Role phải là kiểu chuỗi.' })
  @IsIn(Object.values(GLOBAL_ROLES), {
    message:
      'Role phải là một trong các giá trị: super_admin, user',
  })
  role?: string;
}

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Email của người dùng',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @Matches(EMAIL_POLICY.noWhitespacePattern, {
    message: EMAIL_POLICY.noWhitespaceMessage,
  })
  email!: string;

  @ApiProperty({
    description: 'Mã xác thực email',
    example: '123456',
  })
  @IsNotEmpty({ message: 'Mã xác thực không được để trống.' })
  code!: string;
}

export class ResendVerificationDto {
  @ApiProperty({
    description: 'Email của người dùng',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Email khong hop le.' })
  @Matches(EMAIL_POLICY.noWhitespacePattern, {
    message: EMAIL_POLICY.noWhitespaceMessage,
  })
  @IsNotEmpty({ message: 'Email khong duoc de trong.' })
  email!: string;
}
