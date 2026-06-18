import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthTokenConfigService } from './auth-token-config.service';

@Module({
  imports: [ConfigModule],
  providers: [AuthTokenConfigService],
  exports: [AuthTokenConfigService],
})
export class AuthTokenConfigModule {}
