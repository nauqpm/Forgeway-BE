// src/modules/auth/token.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

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
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '1d',
        },
      }),
    }),

    // Needed for TokenService(ConfigService)
    ConfigModule,

    // Needed for TokenService(UsersService)
    forwardRef(() => UsersModule),

    // Needed for TokenService(AuditLogService)
    AuditModule,
  ],
  providers: [TokenService],
  exports: [TokenService, MongooseModule],
})
export class TokenModule {}
