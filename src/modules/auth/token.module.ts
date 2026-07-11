// src/modules/auth/token.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { AuthTokenConfigModule } from './config/auth-token-config.module';
import { AuthTokenConfigService } from './config/auth-token-config.service';

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
    // Token persistence for issuer, refresh, reset grant, revocation, and lookup services.
    MongooseModule.forFeature([{ name: Token.name, schema: TokenSchema }]),

    // JWT signing and verification for token issuer and refresh services.
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

    // TokenRefreshService validates the user before rotating tokens.
    forwardRef(() => UsersModule),

    // TokenRefreshService logs token-family reuse events.
    forwardRef(() => AuditModule),
  ],
  providers: [
    PasswordResetGrantService,
    TokenIssuerService,
    TokenRefreshService,
    TokenRevocationService,
    TokenLookupService,
  ],
  exports: [
    PasswordResetGrantService,
    TokenIssuerService,
    TokenRefreshService,
    TokenRevocationService,
    TokenLookupService,
    MongooseModule,
  ],
})
export class TokenModule {}
