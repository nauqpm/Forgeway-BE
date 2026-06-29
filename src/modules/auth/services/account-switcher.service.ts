import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SavedAccount,
  SavedAccountDocument,
} from '../schemas/saved-account.schema';
import { UsersService } from '../../users/services/users.service';
import { TokenService } from './token.service';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';

export interface SwitchTokensResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName?: string;
    avatar?: string;
    role: string;
    ssoProvider?: 'google' | null;
  };
}

@Injectable()
export class AccountSwitcherService {
  private readonly logger = new Logger(AccountSwitcherService.name);

  constructor(
    @InjectModel(SavedAccount.name)
    private readonly savedAccountModel: Model<SavedAccountDocument>,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * List all saved accounts visible to the owner, ordered by lastUsedAt desc.
   * Owner is the current logged-in user. We never return entries the owner didn't create.
   */
  async listSavedAccounts(ownerUserId: string) {
    if (!Types.ObjectId.isValid(ownerUserId)) {
      throw new BadRequestException('Invalid owner user id');
    }
    const docs = await this.savedAccountModel
      .find({ ownerUserId: new Types.ObjectId(ownerUserId) })
      .sort({ lastUsedAt: -1 })
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
   * Record that `accountId` was used by `ownerUserId` from a given IP/UA.
   * Called every time a user successfully logs in (or switches) so the dropdown
   * always reflects recent activity.
   */
  async rememberAccount(
    ownerUserId: string,
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
    if (
      !Types.ObjectId.isValid(ownerUserId) ||
      !Types.ObjectId.isValid(account.id)
    ) {
      this.logger.warn(`Skipping rememberAccount: invalid ObjectId`);
      return;
    }
    if (ownerUserId === account.id) {
      // No need to "remember" yourself; current session is implicit.
      return;
    }

    await this.savedAccountModel.updateOne(
      {
        ownerUserId: new Types.ObjectId(ownerUserId),
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

    // Best-effort: prune oldest if owner now exceeds 10 saved accounts.
    try {
      const count = await this.savedAccountModel.countDocuments({
        ownerUserId: new Types.ObjectId(ownerUserId),
      });
      if (count > 10) {
        const oldest = await this.savedAccountModel
          .findOne({ ownerUserId: new Types.ObjectId(ownerUserId) })
          .sort({ lastUsedAt: 1 })
          .select('_id')
          .lean();
        if (oldest) {
          await this.savedAccountModel.deleteOne({ _id: oldest._id });
        }
      }
    } catch (err: unknown) {
      this.logger.warn(
        `Non-fatal: could not prune saved accounts — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Remove a saved account from the owner's switcher list.
   * Idempotent: returns success even if the entry didn't exist.
   */
  async forgetAccount(ownerUserId: string, accountId: string): Promise<void> {
    if (
      !Types.ObjectId.isValid(ownerUserId) ||
      !Types.ObjectId.isValid(accountId)
    ) {
      throw new BadRequestException('Invalid id');
    }
    await this.savedAccountModel.deleteOne({
      ownerUserId: new Types.ObjectId(ownerUserId),
      accountId: new Types.ObjectId(accountId),
    });
  }

  /**
   * Switch the active session into another account the owner has previously used.
   *
   * SECURITY NOTE (per product decision): no password re-prompt is required.
   * Trust is anchored on the owner's currently-valid session.
   *
   * Flow:
   *  1. Validate the saved-account entry exists AND belongs to the current owner.
   *  2. Load target user; ensure still ACTIVE.
   *  3. Revoke current session's tokens (audit + fairness: previous identity is logged out).
   *  4. Issue a fresh access/refresh pair for the target account.
   *  5. Upsert the saved-account entry (lastUsedAt + IP/UA).
   */
  async switchToAccount(
    ownerUserId: string,
    targetAccountId: string,
    meta: { ip?: string; userAgent?: string; ownerRefreshToken?: string },
  ): Promise<SwitchTokensResult> {
    if (
      !Types.ObjectId.isValid(ownerUserId) ||
      !Types.ObjectId.isValid(targetAccountId)
    ) {
      throw new BadRequestException('Invalid id');
    }
    if (ownerUserId === targetAccountId) {
      throw new BadRequestException('Bạn đã ở trong account này');
    }

    // 1. Verify ownership of the saved-account entry
    const entry = await this.savedAccountModel.findOne({
      ownerUserId: new Types.ObjectId(ownerUserId),
      accountId: new Types.ObjectId(targetAccountId),
    });

    if (!entry) {
      throw new ForbiddenException(
        'Bạn chưa từng đăng nhập account này trên thiết bị này. Vui lòng đăng nhập lại bằng email + mật khẩu.',
      );
    }

    // 2. Load target user
    const targetUser = await this.usersService.getUserById(targetAccountId);
    if (targetUser.status !== USER_STATUSES.ACTIVE) {
      throw new ForbiddenException('Account đích hiện không khả dụng');
    }

    // Revoke the owner's refresh token so their previous session can no longer be silently refreshed.
    // Best-effort: a failure here must not abort the switch.
    if (meta.ownerRefreshToken) {
      await this.tokenService
        .revokeSessionTokens(undefined, meta.ownerRefreshToken)
        .catch((err: Error) =>
          this.logger.warn(
            `Non-fatal: could not revoke owner refresh token on switch — ${err.message}`,
          ),
        );
    }

    // 3. Issue new tokens for the target account
    const { accessToken, refreshToken } =
      await this.tokenService.createAndSaveTokens(
        targetUser._id.toString(),
        targetUser.email,
        targetUser.role,
        targetUser.fullName,
        targetUser.avatar,
      );

    // 4. Update the saved-account entry timestamp
    await this.savedAccountModel.updateOne(
      { _id: entry._id },
      {
        $set: {
          lastUsedAt: new Date(),
          lastIp: meta.ip,
          lastUserAgent: meta.userAgent,
          // Refresh public fields in case they changed since last login
          email: targetUser.email,
          fullName: targetUser.fullName,
          avatar: targetUser.avatar,
          role: targetUser.role,
          ssoProvider: targetUser.googleId ? 'google' : null,
        },
      },
    );

    // Best-effort: create reverse entry so target can switch back to owner.
    try {
      const ownerUser = await this.usersService.getUserById(ownerUserId);
      await this.rememberAccount(
        targetAccountId,
        {
          id: ownerUser._id.toString(),
          email: ownerUser.email,
          fullName: ownerUser.fullName ?? undefined,
          avatar: ownerUser.avatar ?? undefined,
          role: ownerUser.role,
          ssoProvider: ownerUser.googleId ? 'google' : null,
        },
        { ip: meta.ip, userAgent: meta.userAgent },
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Non-fatal: could not create reverse switch entry — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.logger.log(
      `🔀 Account switch: ${ownerUserId} → ${String(targetUser._id)} (${targetUser.email})`,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: targetUser._id.toString(),
        email: targetUser.email,
        fullName: targetUser.fullName,
        avatar: targetUser.avatar,
        role: targetUser.role,
        ssoProvider: targetUser.googleId ? 'google' : null,
      },
    };
  }
}
