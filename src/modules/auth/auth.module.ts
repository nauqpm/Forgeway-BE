// src/modules/auth/auth.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthSessionController } from './controllers/auth-session.controller';
import { AuthProfileController } from './controllers/auth-profile.controller';
import { AuthRegistrationController } from './controllers/auth-registration.controller';
import { OAuthController } from './controllers/oauth.controller';
import { PasswordController } from './controllers/password.controller';
import { PermissionController } from './controllers/permission.controller';
import { UserManagementController } from './controllers/user-management.controller';
import { DeviceSwitchAccountsController } from './controllers/device-switch-accounts.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { OtpService } from './services/otp.service';
import { PasswordResetService } from './services/password-reset.service';
import { OAuthService } from './services/oauth.service';
import { AuthRegistrationService } from './services/auth-registration.service';
import { RegistrationVerificationService } from './services/registration-verification.service';
import { CredentialLoginService } from './services/credential-login.service';
import { PasswordService } from './services/password.service';
import { DeviceSwitchAccountsService } from './services/device-switch-accounts.service';
import { LoginSessionTrackingService } from './services/login-session-tracking.service';
import { TokenModule } from './token.module';
import { Otp, OtpSchema } from './schemas/otp.schema';
import { Token, TokenSchema } from './schemas/token.schema';
import { Auth, AuthSchema } from './schemas/auth.schema';
import {
  DeviceSwitchAccount,
  DeviceSwitchAccountSchema,
} from './schemas/device-switch-account.schema';
import { LoginAttemptThrottleService } from './security/login-attempt-throttle.service';

import { User, UserSchema } from '../users/schemas/users.schema';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { VerifyModule } from '../verify/verify.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuditModule } from '../audit/audit.module';
import { GuardsModule } from './guards/guards.module';
import { RedisModule } from '@/infra/redis/redis.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => VerifyModule),
    forwardRef(() => PermissionsModule),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => AuditModule),
    forwardRef(() => GuardsModule),
    RedisModule,
    TokenModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Otp.name, schema: OtpSchema },
      { name: Token.name, schema: TokenSchema },
      { name: Auth.name, schema: AuthSchema },
      { name: DeviceSwitchAccount.name, schema: DeviceSwitchAccountSchema },
    ]),
  ],
  controllers: [
    AuthSessionController,
    AuthProfileController,
    AuthRegistrationController,
    OAuthController,
    PasswordController,
    PermissionController,
    UserManagementController,
    DeviceSwitchAccountsController,
  ],
  providers: [
    AuthRegistrationService,
    RegistrationVerificationService,
    CredentialLoginService,
    PasswordService,
    OtpService,
    PasswordResetService,
    OAuthService,
    DeviceSwitchAccountsService,
    LoginSessionTrackingService,
    LoginAttemptThrottleService,
    JwtStrategy,
    GoogleStrategy,
  ],
  exports: [
    PasswordService,
    OtpService,
    PasswordResetService,
    OAuthService,
    DeviceSwitchAccountsService,
    JwtStrategy,
    GuardsModule,
    TokenModule,
    AuditModule,
  ],
})
export class AuthModule {}
