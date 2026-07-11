import { ApiProperty } from '@nestjs/swagger';

export class DeviceSwitchAccountDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  maskedEmail!: string;

  @ApiProperty({ nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ enum: ['password', 'google'] })
  provider!: 'password' | 'google';

  @ApiProperty({ enum: ['active', 'expired'] })
  status!: 'active' | 'expired';

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  lastAuthenticatedAt!: Date;

  @ApiProperty({ nullable: true })
  lastSwitchedAt!: Date | null;

  @ApiProperty()
  isCurrent!: boolean;
}
