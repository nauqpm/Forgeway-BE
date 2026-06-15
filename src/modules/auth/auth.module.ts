// src/modules/auth/auth.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthController } from './controllers/auth.controller';
import { OAuthController } from './controllers/oauth.controller';
import { PasswordController } from './controllers/password.controller';
import { PermissionController } from './controllers/permission.controller';
import { UserManagementController } from './controllers/user-management.controller';
import { AccountSwitcherController } from './controllers/account-switcher.controller';
import { RecentLoginsController } from './controllers/recent-logins.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { OtpService } from './services/otp.service';
import { PasswordResetService } from './services/password-reset.service';
import { OAuthService } from './services/oauth.service';
import { AuthenticationService } from './services/authentication.service';
import { PasswordService } from './services/password.service';
import { AccountSwitcherService } from './services/account-switcher.service';
import { RecentLoginsService } from './services/recent-logins.service';
import { TokenModule } from './token.module';
import { Otp, OtpSchema } from './schemas/otp.schema';
import { Token, TokenSchema } from './schemas/token.schema';
import { Auth, AuthSchema } from './schemas/auth.schema';
import {
  SavedAccount,
  SavedAccountSchema,
} from './schemas/saved-account.schema';
import { RecentLogin, RecentLoginSchema } from './schemas/recent-login.schema';

import { User, UserSchema } from '../users/schemas/users.schema';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { VerifyModule } from '../verify/verify.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuditModule } from '../audit/audit.module';
import { GuardsModule } from './guards/guards.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => VerifyModule),
    forwardRef(() => PermissionsModule),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => AuditModule),
    forwardRef(() => GuardsModule),
    TokenModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Otp.name, schema: OtpSchema },
      { name: Token.name, schema: TokenSchema },
      { name: Auth.name, schema: AuthSchema },
      { name: SavedAccount.name, schema: SavedAccountSchema },
      { name: RecentLogin.name, schema: RecentLoginSchema },
    ]),
  ],
  controllers: [
    AuthController,
    OAuthController,
    PasswordController,
    PermissionController,
    UserManagementController,
    AccountSwitcherController,
    RecentLoginsController,
  ],
  providers: [
    AuthenticationService,
    PasswordService,
    OtpService,
    PasswordResetService,
    OAuthService,
    AccountSwitcherService,
    RecentLoginsService,
    JwtStrategy,
    GoogleStrategy,
  ],
  exports: [
    AuthenticationService,
    PasswordService,
    OtpService,
    PasswordResetService,
    OAuthService,
    AccountSwitcherService,
    RecentLoginsService,
    JwtStrategy,
    GuardsModule,
    TokenModule,
    AuditModule,
  ],
})
export class AuthModule {}
