// src/modules/auth/token.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { AuthTokenConfigModule } from './config/auth-token-config.module';
import { AuthTokenConfigService } from './config/auth-token-config.service';

import { TokenService } from './services/token.service';

import { Token, TokenSchema } from './schemas/token.schema';

import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    // Needed for TokenService(TokenModel)
    MongooseModule.forFeature([{ name: Token.name, schema: TokenSchema }]),

    // Needed for TokenService(JwtService)
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

    // Needed for TokenService(UsersService)
    forwardRef(() => UsersModule),

    // Needed for TokenService(AuditLogService) — circular: TokenModule ↔ AuditModule
    forwardRef(() => AuditModule),
  ],
  providers: [TokenService],
  exports: [TokenService, MongooseModule],
})
export class TokenModule {}
