import { ApiProperty } from '@nestjs/swagger';

export class SavedAccountResponseDto {
  @ApiProperty()
  accountId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ required: false })
  fullName?: string;

  @ApiProperty({ required: false })
  avatar?: string;

  @ApiProperty()
  role!: string;

  @ApiProperty({ required: false, nullable: true })
  ssoProvider?: 'google' | null;

  @ApiProperty()
  lastUsedAt!: Date;

  @ApiProperty({ enum: ['parked', 'reauth_required'] })
  switchState!: 'parked' | 'reauth_required';
}
