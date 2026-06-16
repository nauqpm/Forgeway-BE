import { IsEmail, IsString, IsEnum } from 'class-validator';

export enum VerifyType {
  VERIFICATION = 'verification',
  PASSWORD_RESET = 'password-reset',
}

export class SendVerifyDto {
  @IsEmail()
  email!: string;

  @IsEnum(VerifyType)
  type!: VerifyType;
}

export class CheckVerifyDto {
  @IsEmail()
  email!: string;

  @IsString()
  code!: string;

  @IsEnum(VerifyType)
  type!: VerifyType;
}

export class ConfirmVerifyDto {
  @IsString()
  token!: string;
}
