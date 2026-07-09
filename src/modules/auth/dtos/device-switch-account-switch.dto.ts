import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class DeviceSwitchAccountSwitchDto {
  @ApiProperty()
  @IsMongoId()
  targetUserId!: string;
}

export class DeviceSwitchAccountSwitchRenewDto {
  @ApiProperty({ enum: ['REQUIRES_FULL_LOGIN'] })
  code!: 'REQUIRES_FULL_LOGIN';

  @ApiProperty()
  targetUserId!: string;

  @ApiProperty({ enum: ['password', 'google'] })
  provider!: 'password' | 'google';

  @ApiProperty()
  redirectTo!: string;
}
