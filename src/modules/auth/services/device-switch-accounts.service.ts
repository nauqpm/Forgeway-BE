import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  DeviceSwitchAccount,
  DeviceSwitchAccountDocument,
  DeviceSwitchAccountProvider,
} from '../schemas/device-switch-account.schema';
import { UsersService } from '../../users/services/users.service';
import { TokenService } from './token.service';

const DEVICE_SWITCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface RememberAccountInput {
  id: string;
  email: string;
  fullName?: string;
  avatar?: string;
  role: string;
  ssoProvider?: 'google' | null;
}

type SwitchAccountResult =
  | {
      success: true;
      redirectTo: '/';
      accessToken: string;
      refreshToken: string;
      switchedUser: {
        id: string;
        displayName: string;
      };
    }
  | {
      success: false;
      code: 'REQUIRES_FULL_LOGIN';
      targetUserId: string;
      provider: 'password' | 'google';
      redirectTo: string;
    };

@Injectable()
export class DeviceSwitchAccountsService {
  constructor(
    @InjectModel(DeviceSwitchAccount.name)
    private readonly deviceSwitchAccountModel: Model<DeviceSwitchAccountDocument>,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {}

  async rememberSuccessfulLogin(
    deviceId: string,
    account: RememberAccountInput,
    _meta?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    const now = new Date();
    await this.deviceSwitchAccountModel.updateOne(
      {
        deviceId,
        userId: new Types.ObjectId(account.id),
      },
      {
        $set: {
          status: 'active',
          expiresAt: new Date(now.getTime() + DEVICE_SWITCH_TTL_MS),
          lastAuthenticatedAt: now,
          displayName: account.fullName?.trim() || account.email,
          maskedEmail: this.maskEmail(account.email),
          avatarUrl: account.avatar ?? null,
          provider: this.providerFromAccount(account.ssoProvider),
        },
        $setOnInsert: {
          lastSwitchedAt: null,
        },
      },
      { upsert: true },
    );
  }

  async listForDevice(deviceId: string, currentUserId: string) {
    const docs = await this.deviceSwitchAccountModel
      .find({ deviceId, status: { $ne: 'removed' } })
      .sort({ lastAuthenticatedAt: -1 })
      .lean()
      .exec();

    const rows: Array<{
      userId: string;
      displayName: string;
      maskedEmail: string;
      avatarUrl: string | null;
      provider: 'password' | 'google';
      status: 'active' | 'expired';
      expiresAt: Date;
      lastAuthenticatedAt: Date;
      lastSwitchedAt: Date | null;
      isCurrent: boolean;
    }> = [];

    for (const doc of docs) {
      const status = await this.normalizeStatus(doc);
      rows.push({
        userId: doc.userId.toString(),
        displayName: doc.displayName,
        maskedEmail: doc.maskedEmail,
        avatarUrl: doc.avatarUrl ?? null,
        provider: doc.provider,
        status,
        expiresAt: doc.expiresAt,
        lastAuthenticatedAt: doc.lastAuthenticatedAt,
        lastSwitchedAt: doc.lastSwitchedAt ?? null,
        isCurrent: doc.userId.toString() === currentUserId,
      });
    }

    return rows.sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return (
        new Date(b.lastAuthenticatedAt).getTime() -
        new Date(a.lastAuthenticatedAt).getTime()
      );
    });
  }

  async removeForDevice(deviceId: string, targetUserId: string): Promise<void> {
    await this.deviceSwitchAccountModel.updateOne(
      {
        deviceId,
        userId: new Types.ObjectId(targetUserId),
      },
      { $set: { status: 'removed' } },
    );
  }

  async switchToDeviceAccount(
    deviceId: string,
    targetUserId: string,
    meta: { refreshToken?: string; userAgent?: string },
  ): Promise<SwitchAccountResult> {
    const doc = await this.deviceSwitchAccountModel.findOne({
      deviceId,
      userId: new Types.ObjectId(targetUserId),
      status: { $ne: 'removed' },
    });

    if (!doc) {
      return {
        success: false,
        code: 'REQUIRES_FULL_LOGIN',
        targetUserId,
        provider: 'password',
        redirectTo: `/login?intent=switch-renew&targetUserId=${targetUserId}`,
      };
    }

    const status = await this.normalizeStatus({
      deviceId: doc.deviceId,
      userId: doc.userId,
      status: doc.status,
      expiresAt: doc.expiresAt,
    });

    if (status === 'expired') {
      return {
        success: false,
        code: 'REQUIRES_FULL_LOGIN',
        targetUserId,
        provider: doc.provider,
        redirectTo: `/login?intent=switch-renew&targetUserId=${targetUserId}&provider=${doc.provider}`,
      };
    }

    const user = await this.usersService.getUserById(targetUserId);

    if (meta.refreshToken) {
      await this.tokenService.revokeSessionTokens(undefined, meta.refreshToken);
    }

    const tokens = await this.tokenService.createAndSaveTokens(
      user._id.toString(),
      user.email,
      user.role,
      user.fullName,
      user.avatar,
    );

    await this.deviceSwitchAccountModel.updateOne(
      { deviceId, userId: new Types.ObjectId(targetUserId) },
      { $set: { lastSwitchedAt: new Date() } },
    );

    return {
      success: true,
      redirectTo: '/',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      switchedUser: {
        id: user._id.toString(),
        displayName: user.fullName || user.email,
      },
    };
  }

  private providerFromAccount(
    ssoProvider?: 'google' | null,
  ): DeviceSwitchAccountProvider {
    return ssoProvider === 'google' ? 'google' : 'password';
  }

  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    const visible = localPart?.charAt(0) || '*';
    return `${visible}***@${domain ?? ''}`;
  }

  private async normalizeStatus(doc: {
    deviceId: string;
    userId: Types.ObjectId;
    status: 'active' | 'expired' | 'removed';
    expiresAt: Date;
  }): Promise<'active' | 'expired'> {
    if (doc.status === 'removed') return 'expired';
    if (doc.expiresAt.getTime() > Date.now()) return 'active';

    if (doc.status !== 'expired') {
      await this.deviceSwitchAccountModel.updateOne(
        { deviceId: doc.deviceId, userId: doc.userId },
        { $set: { status: 'expired' } },
      );
    }

    return 'expired';
  }
}
