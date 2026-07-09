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
    rootUser: {
      id: string;
    };
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
   * List all saved accounts visible to the root owner, ordered by lastUsedAt desc.
   * Always uses rootOwnerUserId so A, B (switched from A), and C (switched from A via B)
   * all see the same list — the list belonging to root A.
   */
  async listSavedAccounts(rootOwnerUserId: string) {
    if (!Types.ObjectId.isValid(rootOwnerUserId)) {
      throw new BadRequestException('Invalid owner user id');
    }
    const docs = await this.savedAccountModel
      .find({ rootOwnerUserId: new Types.ObjectId(rootOwnerUserId) })
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
   * Record that `account` was used/switched-to by the root owner.
   * Always keyed on `rootOwnerUserId` so indirect switches (A→B→C) are stored
   * under root A, not under the current active user B.
   *
   * @param rootOwnerUserId - The root/original user (never changes across switch chain).
   * @param account         - The account being remembered.
   * @param meta            - IP and User-Agent for audit.
   */
  async rememberAccount(
    rootOwnerUserId: string,
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
      !Types.ObjectId.isValid(rootOwnerUserId) ||
      !Types.ObjectId.isValid(account.id)
    ) {
      this.logger.warn(`Skipping rememberAccount: invalid ObjectId`);
      return;
    }
    if (rootOwnerUserId === account.id) {
      // No need to remember yourself; the current session is implicit.
      return;
    }

    await this.savedAccountModel.updateOne(
      {
        rootOwnerUserId: new Types.ObjectId(rootOwnerUserId),
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

    // Best-effort: prune oldest if root owner now exceeds 10 saved accounts.
    try {
      const count = await this.savedAccountModel.countDocuments({
        rootOwnerUserId: new Types.ObjectId(rootOwnerUserId),
      });
      if (count > 10) {
        const oldest = await this.savedAccountModel
          .findOne({ rootOwnerUserId: new Types.ObjectId(rootOwnerUserId) })
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
   * Remove a saved account from the root owner's switcher list.
   * Idempotent: returns success even if the entry didn't exist.
   */
  async forgetAccount(
    rootOwnerUserId: string,
    accountId: string,
  ): Promise<void> {
    if (
      !Types.ObjectId.isValid(rootOwnerUserId) ||
      !Types.ObjectId.isValid(accountId)
    ) {
      throw new BadRequestException('Invalid id');
    }
    await this.savedAccountModel.deleteOne({
      rootOwnerUserId: new Types.ObjectId(rootOwnerUserId),
      accountId: new Types.ObjectId(accountId),
    });
  }

  /**
   * Switch the active session into another account.
   *
   * Root cause fix: all saved-account lookups use `rootOwnerUserId` (from JWT payload),
   * NOT `currentUserId`. This allows indirect switches A→B→C to work correctly because
   * the entry {rootOwnerUserId=A, accountId=C} was created when A originally switched.
   *
   * SECURITY NOTE (per product decision): no password re-prompt is required.
   * Trust is anchored on the root owner's JWT-embedded rootUserId.
   *
   * Flow:
   *  1. Validate ownership via (rootOwnerUserId, targetAccountId) — always uses root.
   *  2. Special case: switching BACK to root skips entry check (root is always accessible).
   *  3. Load target user; ensure still ACTIVE.
   *  4. Revoke current session tokens.
   *  5. Issue fresh tokens for target account, embedding rootOwnerUserId in JWT.
   *  6. Upsert saved-account entry and create reverse entry (target → root).
   *
   * @param rootOwnerUserId - Root/original user from JWT (`rootUserId ?? userId`). Never changes.
   * @param targetAccountId - The account to switch into.
   * @param meta            - IP, User-Agent, and current refresh token.
   */
  async switchToAccount(
    rootOwnerUserId: string,
    targetAccountId: string,
    meta: { ip?: string; userAgent?: string; ownerRefreshToken?: string },
  ): Promise<SwitchTokensResult> {
    if (
      !Types.ObjectId.isValid(rootOwnerUserId) ||
      !Types.ObjectId.isValid(targetAccountId)
    ) {
      throw new BadRequestException('Invalid id');
    }

    // Special case: switching back to root never needs a saved-account entry.
    const isSwitchingToRoot = targetAccountId === rootOwnerUserId;

    // 1. Verify that root owner has this account saved (using rootOwnerUserId — the fix).
    const entry = isSwitchingToRoot
      ? null
      : await this.savedAccountModel.findOne({
          rootOwnerUserId: new Types.ObjectId(rootOwnerUserId),
          accountId: new Types.ObjectId(targetAccountId),
        });

    if (!entry && !isSwitchingToRoot) {
      throw new ForbiddenException(
        'Bạn chưa từng đăng nhập account này trên thiết bị này. Vui lòng đăng nhập lại bằng email + mật khẩu.',
      );
    }

    // 2. Load target user and verify active status.
    const targetUser = await this.usersService.getUserById(targetAccountId);
    if (targetUser.status !== USER_STATUSES.ACTIVE) {
      throw new ForbiddenException('Account đích hiện không khả dụng');
    }

    // 3. Revoke the current session's refresh token (best-effort, non-blocking).
    if (meta.ownerRefreshToken) {
      await this.tokenService
        .revokeSessionTokens(undefined, meta.ownerRefreshToken)
        .catch((err: Error) =>
          this.logger.warn(
            `Non-fatal: could not revoke owner refresh token on switch — ${err.message}`,
          ),
        );
    }

    // 4. Issue new tokens for the target account.
    //    rootOwnerUserId is embedded in JWT so the next switch still knows the root.
    const { accessToken, refreshToken } =
      await this.tokenService.createAndSaveTokens(
        targetUser._id.toString(),
        targetUser.email,
        targetUser.role,
        targetUser.fullName,
        targetUser.avatar,
        // Preserve root: if switching to root, rootUserId = targetAccountId itself (no need to embed).
        isSwitchingToRoot ? undefined : rootOwnerUserId,
      );

    // 5. Update the saved-account entry's timestamp (if entry exists).
    if (entry) {
      await this.savedAccountModel.updateOne(
        { _id: entry._id },
        {
          $set: {
            lastUsedAt: new Date(),
            lastIp: meta.ip,
            lastUserAgent: meta.userAgent,
            email: targetUser.email,
            fullName: targetUser.fullName,
            avatar: targetUser.avatar,
            role: targetUser.role,
            ssoProvider: targetUser.googleId ? 'google' : null,
          },
        },
      );
    }

    // 6. Best-effort: upsert entry for this switch (rootOwner → target).
    await this.rememberAccount(
      rootOwnerUserId,
      {
        id: targetUser._id.toString(),
        email: targetUser.email,
        fullName: targetUser.fullName ?? undefined,
        avatar: targetUser.avatar ?? undefined,
        role: targetUser.role,
        ssoProvider: targetUser.googleId ? 'google' : null,
      },
      { ip: meta.ip, userAgent: meta.userAgent },
    ).catch((err: unknown) =>
      this.logger.warn(
        `Non-fatal: could not upsert switch entry — ${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    // 7. Best-effort: create reverse entry so target can switch back to root.
    try {
      const rootUser = await this.usersService.getUserById(rootOwnerUserId);
      await this.rememberAccount(
        // Reverse entry: target user is now the "root owner" for switching back.
        // We store it as rootOwnerUserId = rootOwnerUserId so root's list always stays consistent.
        // Actually the reverse: target can switch back to root, so entry owner = target, accountId = root.
        // But we key everything by root, so we use a simpler approach:
        // just remember root on target's OWN root chain (if target ever becomes someone's root).
        // For now: upsert {rootOwnerUserId=targetAccountId, accountId=rootOwnerUserId} so target
        // can also switch back even if they are someone else's root.
        targetUser._id.toString(),
        {
          id: rootUser._id.toString(),
          email: rootUser.email,
          fullName: rootUser.fullName ?? undefined,
          avatar: rootUser.avatar ?? undefined,
          role: rootUser.role,
          ssoProvider: rootUser.googleId ? 'google' : null,
        },
        { ip: meta.ip, userAgent: meta.userAgent },
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Non-fatal: could not create reverse switch entry — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.logger.log(
      `🔀 Account switch: root=${rootOwnerUserId} → ${String(targetUser._id)} (${targetUser.email})`,
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
        rootUser: {
          id: rootOwnerUserId,
        },
      },
    };
  }
}
