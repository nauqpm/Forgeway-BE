import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  RecentLogin,
  RecentLoginDocument,
} from '../schemas/recent-login.schema';

export interface RecentAccountDto {
  accountId: string;
  email: string;
  fullName?: string;
  avatar?: string;
  role: string;
  ssoProvider?: 'google' | null;
  lastUsedAt: Date;
}

@Injectable()
export class RecentLoginsService {
  private readonly logger = new Logger(RecentLoginsService.name);

  constructor(
    @InjectModel(RecentLogin.name)
    private readonly recentLoginModel: Model<RecentLoginDocument>,
  ) {}

  /**
   * Sinh deviceId mới (UUID v4). Gọi khi request không có cookie device_id.
   */
  static generateDeviceId(): string {
    return randomUUID();
  }

  /**
   * Ghi nhận account đã login trên device. Upsert theo (deviceId, accountId).
   *
   * Khác với AccountSwitcherService.rememberAccount (bỏ qua nếu owner === account):
   *  - Hàm này LUÔN ghi, kể cả khi account chính là người login — vì list "gần đây" cần
   *    hiển thị cả account hiện tại để người dùng switch về.
   */
  async remember(
    deviceId: string,
    account: {
      id: string;
      email: string;
      fullName?: string;
      avatar?: string;
      role: string;
      ssoProvider?: 'google' | null;
    },
    meta: { ip?: string; userAgent?: string },
  ): Promise<void> {
    if (!deviceId) {
      this.logger.warn('Skipping remember: missing deviceId');
      return;
    }
    if (!Types.ObjectId.isValid(account.id)) {
      this.logger.warn(`Skipping remember: invalid accountId ${account.id}`);
      return;
    }

    await this.recentLoginModel.updateOne(
      {
        deviceId,
        accountId: new Types.ObjectId(account.id),
      },
      {
        $set: {
          email: account.email,
          fullName: account.fullName,
          avatar: account.avatar,
          role: account.role,
          ssoProvider: account.ssoProvider ?? null,
          lastUsedAt: new Date(),
          lastIp: meta.ip,
          lastUserAgent: meta.userAgent,
        },
      },
      { upsert: true },
    );
  }

  /**
   * Lấy danh sách account đã login trên device, sort lastUsedAt desc, giới hạn 10.
   */
  async listForDevice(
    deviceId: string,
    limit = 10,
  ): Promise<RecentAccountDto[]> {
    if (!deviceId) return [];
    const docs = await this.recentLoginModel
      .find({ deviceId })
      .sort({ lastUsedAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return docs.map(d => ({
      accountId: d.accountId.toString(),
      email: d.email,
      fullName: d.fullName,
      avatar: d.avatar,
      role: d.role,
      ssoProvider: d.ssoProvider ?? null,
      lastUsedAt: d.lastUsedAt,
    }));
  }

  /**
   * Xoá 1 account khỏi danh sách "gần đây" của device. Idempotent.
   */
  async forgetForDevice(deviceId: string, accountId: string): Promise<void> {
    if (!deviceId || !Types.ObjectId.isValid(accountId)) return;
    await this.recentLoginModel.deleteOne({
      deviceId,
      accountId: new Types.ObjectId(accountId),
    });
  }

  /**
   * Xoá toàn bộ danh sách "gần đây" của device khi logout.
   * Giữ cookie device_id để device identity còn đó cho lần login sau.
   */
  async clearForDevice(deviceId: string): Promise<void> {
    if (!deviceId) return;
    await this.recentLoginModel.deleteMany({ deviceId });
  }
}
