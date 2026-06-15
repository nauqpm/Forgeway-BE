import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '1d',
        },
      }),
    }),
  ],
  providers: [JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, JwtModule],
})
export class GuardsModule {}
