// src/modules/auth/token.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { AuthTokenConfigModule } from './config/auth-token-config.module';
import { AuthTokenConfigService } from './config/auth-token-config.service';

import { TokenService } from './services/token.service';
import { PasswordResetGrantService } from './services/password-reset-grant.service';
import { TokenIssuerService } from './services/token-issuer.service';
import { TokenRefreshService } from './services/token-refresh.service';
import { TokenRevocationService } from './services/token-revocation.service';
import { TokenLookupService } from './services/token-lookup.service';

import { Token, TokenSchema } from './schemas/token.schema';

import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    // Needed by sub-services (TokenIssuerService, TokenRefreshService, PasswordResetGrantService, TokenLookupService)
    MongooseModule.forFeature([{ name: Token.name, schema: TokenSchema }]),

    // Needed by TokenService(peekUserIdFromAccessToken) and TokenIssuerService/TokenRefreshService
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
    AuthTokenConfigModule,

    // Needed by sub-services (TokenRefreshService)
    forwardRef(() => UsersModule),

    // Needed by sub-services (TokenRefreshService) — circular: TokenModule ↔ AuditModule
    forwardRef(() => AuditModule),
  ],
  providers: [
    TokenService,
    PasswordResetGrantService,
    TokenIssuerService,
    TokenRefreshService,
    TokenRevocationService,
    TokenLookupService,
  ],
  exports: [
    TokenService,
    PasswordResetGrantService,
    TokenIssuerService,
    TokenRefreshService,
    TokenRevocationService,
    TokenLookupService,
    MongooseModule,
  ],
})
export class TokenModule {}
