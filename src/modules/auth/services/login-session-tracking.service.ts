import { randomUUID } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';

import { DeviceSwitchAccountsService } from './device-switch-accounts.service';

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
    private readonly deviceSwitchAccountsService: DeviceSwitchAccountsService,
  ) {}

  static generateDeviceId(): string {
    return randomUUID();
  }

  async trackLoginSession(
    input: LoginSessionTrackingInput,
  ): Promise<LoginSessionTrackingResult> {
    const deviceId =
      input.deviceId ?? LoginSessionTrackingService.generateDeviceId();
    const generatedDeviceId = input.deviceId ? undefined : deviceId;

    try {
      await this.deviceSwitchAccountsService.rememberSuccessfulLogin(
        deviceId,
        {
          id: input.loggedInUser.id,
          email: input.loggedInUser.email,
          fullName: input.loggedInUser.fullName,
          avatar: input.loggedInUser.avatar,
          role: input.loggedInUser.role,
          ssoProvider:
            input.loggedInUser.ssoProvider === 'google' ? 'google' : null,
        },
        { ip: input.ip, userAgent: input.userAgent },
      );
    } catch (error) {
      this.logger.warn(
        `rememberSuccessfulLogin failed: ${this.getErrorMessage(error)}`,
      );
    }

    return { generatedDeviceId };
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
