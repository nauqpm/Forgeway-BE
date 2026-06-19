import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthTokenConfigModule } from '../config/auth-token-config.module';
import { AuthTokenConfigService } from '../config/auth-token-config.service';
import { PassportModule } from '@nestjs/passport';

import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AuditModule } from '../../audit/audit.module';
import { TokenModule } from '../token.module';

@Module({
  imports: [
    PassportModule,
    forwardRef(() => AuditModule),
    forwardRef(() => TokenModule),
    JwtModule.registerAsync({
      imports: [AuthTokenConfigModule],
      inject: [AuthTokenConfigService],
      useFactory: (authTokenConfig: AuthTokenConfigService) => ({
        secret: authTokenConfig.jwtSecret,
        signOptions: {
          expiresIn: authTokenConfig.accessTokenTtlSeconds,
        },
      }),
    }),
  ],
  providers: [JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, JwtModule],
})
export class GuardsModule {}
