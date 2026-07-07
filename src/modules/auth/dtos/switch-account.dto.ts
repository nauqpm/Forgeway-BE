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
  'mfa_otp',
  'sso_assertion',
] as const;

export type SwitchCredentialType = (typeof SWITCH_CREDENTIAL_TYPES)[number];
type SwitchCredentialField = 'password' | 'otp' | 'ssoAssertion';

export class SwitchCredentialDto {
  @ApiProperty({
    enum: SWITCH_CREDENTIAL_TYPES,
    description:
      'Credential method. password requires password only; mfa_otp requires otp only; sso_assertion requires ssoAssertion only.',
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
    description: 'Required only when credential.type=mfa_otp.',
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
  const expectedFieldByType: Record<SwitchCredentialType, SwitchCredentialField> =
    {
      password: 'password',
      mfa_otp: 'otp',
      sso_assertion: 'ssoAssertion',
    };

  return (
    providedFields.length === 1 &&
    providedFields[0] === expectedFieldByType[credential.type]
  );
}

export class SwitchAccountDto {
  @ApiProperty({ description: 'Mongo ObjectId of the account to switch into' })
  @IsMongoId()
  accountId!: string;

  @ApiProperty({
    type: () => SwitchCredentialDto,
    description:
      'Target-account credential. Send exactly one field matching credential.type.',
  })
  @ValidateNested()
  @Type(() => SwitchCredentialDto)
  @IsNotEmpty()
  credential!: SwitchCredentialDto;
}
