import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export const SWITCH_CREDENTIAL_TYPES = [
  'password',
  'mfa_full',
  'sso_assertion',
  'parked',
] as const;

export type SwitchCredentialType = (typeof SWITCH_CREDENTIAL_TYPES)[number];
type SwitchCredentialField = 'password' | 'otp' | 'ssoAssertion';

export class SwitchCredentialDto {
  @ApiProperty({
    enum: SWITCH_CREDENTIAL_TYPES,
    description:
      'Credential method. password requires password only; mfa_full requires password and otp; sso_assertion requires ssoAssertion only; parked uses a server-side parked session.',
  })
  @IsIn(SWITCH_CREDENTIAL_TYPES)
  type!: SwitchCredentialType;

  @ApiPropertyOptional({
    description: 'Required only when credential.type=password.',
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    description: 'Required only when credential.type=mfa_full.',
  })
  @IsOptional()
  @IsString()
  otp?: string;

  @ApiPropertyOptional({
    description: 'Required only when credential.type=sso_assertion.',
  })
  @IsOptional()
  @IsString()
  ssoAssertion?: string;
}

export function isValidSwitchCredentialShape(
  credential?: SwitchCredentialDto,
): credential is SwitchCredentialDto {
  if (!credential) {
    return false;
  }

  const values: Record<SwitchCredentialField, string> = {
    password: credential.password?.trim() ?? '',
    otp: credential.otp?.trim() ?? '',
    ssoAssertion: credential.ssoAssertion?.trim() ?? '',
  };
  const providedFields = Object.entries(values)
    .filter(([, value]) => value.length > 0)
    .map(([field]) => field);
  if (credential.type === 'password') {
    return providedFields.length === 1 && providedFields[0] === 'password';
  }

  if (credential.type === 'parked') {
    return providedFields.length === 0;
  }

  if (credential.type === 'mfa_full') {
    return (
      providedFields.length === 2 &&
      values.password.length > 0 &&
      values.otp.length > 0
    );
  }

  return (
    credential.type === 'sso_assertion' &&
    providedFields.length === 1 &&
    providedFields[0] === 'ssoAssertion'
  );
}

export class SwitchAccountDto {
  @ApiProperty({ description: 'Mongo ObjectId of the account to switch into' })
  @IsMongoId()
  accountId!: string;

  @ApiProperty({
    type: () => SwitchCredentialDto,
    description:
      'Target-account credential. Password uses password only; MFA uses password plus OTP; parked uses a server-side parked session.',
  })
  @ValidateNested()
  @Type(() => SwitchCredentialDto)
  @IsNotEmpty()
  credential!: SwitchCredentialDto;
}
