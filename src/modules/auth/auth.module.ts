// src/modules/auth/auth.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller';
import { OAuthController } from './controllers/oauth.controller';
import { PasswordController } from './controllers/password.controller';
import { PermissionController } from './controllers/permission.controller';
import { UserManagementController } from './controllers/user-management.controller';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '@/modules/workspaces/workspaces.module';
import { TokenService } from './services/token.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenModule } from './token.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/users.schema';
import { GoogleStrategy } from './strategies/google.strategy';
import { VerifyModule } from '../verify/verify.module';
import { Otp, OtpSchema } from './schemas/otp.schema';
import { Token, TokenSchema } from './schemas/token.schema';
import { PermissionsModule } from '../permissions/permissions.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Auth, AuthSchema } from './schemas/auth.schema';
import { OtpService } from './services/otp.service';
import { PasswordResetService } from './services/password-reset.service';
import { OAuthService } from './services/oauth.service';
import { AuthenticationService } from './services/authentication.service';
import { PasswordService } from './services/password.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => VerifyModule),
    forwardRef(() => PermissionsModule),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => AuditModule),
    TokenModule,
    PassportModule,
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
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Otp.name, schema: OtpSchema },
      { name: Token.name, schema: TokenSchema },
      { name: Auth.name, schema: AuthSchema },
    ]),
  ],
  controllers: [
    AuthController,
    OAuthController,
    PasswordController,
    PermissionController,
    UserManagementController,
  ],
  providers: [
    AuthenticationService,
    PasswordService,
    TokenService,
    OtpService,
    PasswordResetService,
    OAuthService,
    JwtStrategy,
    GoogleStrategy,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthenticationService,
    PasswordService,
    TokenService,
    OtpService,
    PasswordResetService,
    OAuthService,
    JwtStrategy,
    JwtModule,
    JwtAuthGuard,
    RolesGuard,
    AuditModule,
  ],
})
export class AuthModule { }
