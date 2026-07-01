import { Injectable, Logger } from '@nestjs/common';

import { AccountSwitcherService } from './account-switcher.service';
import { RecentLoginsService } from './recent-logins.service';
import { TokenService } from './token.service';

export interface LoginSessionUser {
  id: string;
  email: string;
  fullName?: string;
  avatar?: string;
  role: string;
  ssoProvider?: 'google' | null;
}

export interface LoginSessionTrackingInput {
  loggedInUser: LoginSessionUser;
  existingAccessToken?: string;
  deviceId?: string;
  ip?: string;
  userAgent?: string;
}

export interface LoginSessionTrackingResult {
  generatedDeviceId?: string;
}

@Injectable()
export class LoginSessionTrackingService {
  private readonly logger = new Logger(LoginSessionTrackingService.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly accountSwitcherService: AccountSwitcherService,
    private readonly recentLoginsService: RecentLoginsService,
  ) {}

  async trackLoginSession(
    input: LoginSessionTrackingInput,
  ): Promise<LoginSessionTrackingResult> {
    const account: LoginSessionUser = {
      ...input.loggedInUser,
      ssoProvider:
        input.loggedInUser.ssoProvider === 'google' ? 'google' : null,
    };
    const meta = { ip: input.ip, userAgent: input.userAgent };
    const ownerUserId = this.tokenService.peekUserIdFromAccessToken(
      input.existingAccessToken,
    );

    if (ownerUserId && ownerUserId !== account.id) {
      try {
        await this.accountSwitcherService.rememberAccount(
          ownerUserId,
          account,
          meta,
        );
      } catch (error) {
        this.logger.warn(
          `rememberAccount failed: ${this.getErrorMessage(error)}`,
        );
      }
    }

    const deviceId = input.deviceId ?? RecentLoginsService.generateDeviceId();
    const generatedDeviceId = input.deviceId ? undefined : deviceId;

    try {
      await this.recentLoginsService.remember(deviceId, account, meta);
    } catch (error) {
      this.logger.warn(
        `recentLogins.remember failed: ${this.getErrorMessage(error)}`,
      );
    }

    return { generatedDeviceId };
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
