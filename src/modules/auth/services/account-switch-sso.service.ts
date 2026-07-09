import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Model, Types } from 'mongoose';

import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { UsersService } from '../../users/services/users.service';
import { SavedAccount } from '../schemas/saved-account.schema';
import { ParkedSession } from '../schemas/parked-session.schema';
import {
  AccountSwitchPendingState,
  AccountSwitchPendingStateDocument,
} from '../schemas/account-switch-pending-state.schema';
import { TokenService } from './token.service';

interface SignedSwitchState {
  actorUserId: string;
  targetAccountId: string;
  deviceId: string;
  nonce: string;
  expiresAt: string;
}

interface InitSwitchSsoOptions {
  deviceId?: string;
  currentPageUrl?: string;
}

interface CompleteSwitchSsoOptions {
  deviceId?: string;
}

interface VerifiedGoogleIdentity {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  iss?: string;
}

@Injectable()
export class AccountSwitchSsoService {
  private readonly googleClient: OAuth2Client;

  constructor(
    @InjectModel(SavedAccount.name)
    private readonly savedAccountModel: Model<SavedAccount>,
    @InjectModel(ParkedSession.name)
    private readonly parkedSessionModel: Model<ParkedSession>,
    @InjectModel(AccountSwitchPendingState.name)
    private readonly pendingStateModel: Model<AccountSwitchPendingStateDocument>,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.getRedirectUri(),
    );
  }

  async initSwitch(
    actorUserId: string,
    targetAccountId: string,
    options: InitSwitchSsoOptions,
  ) {
    const deviceId = this.requireDeviceId(options.deviceId);
    const actorObjectId = this.toObjectId(actorUserId);
    const targetObjectId = this.toObjectId(targetAccountId);
    const currentPageUrl = this.normalizeCurrentPageUrl(options.currentPageUrl);

    const savedEntry = await this.savedAccountModel.findOne({
      ownerUserId: actorObjectId,
      accountId: targetObjectId,
    });

    if (!savedEntry) {
      throw new ForbiddenException('Account switch is not allowed');
    }

    const targetAccount = await this.usersService.getUserById(targetAccountId);
    if (!targetAccount || targetAccount.status !== USER_STATUSES.ACTIVE) {
      throw new ForbiddenException('Account switch is not allowed');
    }

    if (targetAccount.password || !targetAccount.googleId) {
      throw new BadRequestException('SSO switch is only available for SSO accounts');
    }

    const nonce = randomBytes(16).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const statePayload: SignedSwitchState = {
      actorUserId,
      targetAccountId,
      deviceId,
      nonce,
      expiresAt: expiresAt.toISOString(),
    };
    const state = this.signState(statePayload);

    await this.pendingStateModel.create({
      actorUserId: actorObjectId,
      targetAccountId: targetObjectId,
      deviceId,
      nonce,
      stateHash: this.hashState(state),
      currentPageUrl,
      expiresAt,
    });

    return {
      authorizationUrl: this.buildAuthorizationUrl(state),
    };
  }

  async completeSwitch(
    state: string,
    code: string,
    options: CompleteSwitchSsoOptions,
  ) {
    if (!code) {
      throw new BadRequestException('Missing SSO authorization code');
    }

    const deviceId = this.requireDeviceId(options.deviceId);
    const statePayload = this.verifyState(state);

    // device_id is verified by cookie.utils before this comparison.
    if (statePayload.deviceId !== deviceId) {
      throw new UnauthorizedException('Invalid SSO switch state');
    }

    const pendingState = await this.pendingStateModel.findOne({
      nonce: statePayload.nonce,
      stateHash: this.hashState(state),
    });

    if (!pendingState) {
      throw new UnauthorizedException('Invalid SSO switch state');
    }

    if (pendingState.usedAt) {
      throw new UnauthorizedException('SSO switch state has already been used');
    }

    if (pendingState.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('SSO switch state has expired');
    }

    const targetAccount = await this.usersService.getUserById(
      pendingState.targetAccountId.toString(),
    );
    if (!targetAccount || targetAccount.status !== USER_STATUSES.ACTIVE) {
      throw new ForbiddenException('Account switch is not allowed');
    }

    const googleIdentity = await this.exchangeGoogleCode(code);
    this.assertGoogleIdentityMatchesTarget(googleIdentity, targetAccount);

    const tokens = await this.tokenService.createAndSaveTokens(
      targetAccount._id.toString(),
      targetAccount.email,
      targetAccount.role,
      targetAccount.fullName,
      targetAccount.avatar,
    );
    await this.parkedSessionModel.updateOne(
      {
        ownerUserId: pendingState.actorUserId,
        accountId: pendingState.targetAccountId,
        deviceId,
      },
      {
        $set: {
          refreshTokenHash: this.tokenService.hashToken(tokens.refreshToken),
          lastUsedAt: new Date(),
        },
      },
      { upsert: true },
    );
    await this.pendingStateModel.updateOne(
      { _id: pendingState._id, usedAt: { $exists: false } },
      { $set: { usedAt: new Date() } },
    );

    return {
      ...tokens,
      user: targetAccount,
      actorUserId: pendingState.actorUserId.toString(),
      targetAccountId: pendingState.targetAccountId.toString(),
      currentPageUrl: pendingState.currentPageUrl,
    };
  }

  protected async exchangeGoogleCode(
    code: string,
  ): Promise<VerifiedGoogleIdentity> {
    const { tokens } = await this.googleClient.getToken({
      code,
      redirect_uri: this.getRedirectUri(),
    });

    if (!tokens.id_token) {
      throw new UnauthorizedException('Missing Google identity token');
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.getGoogleAudiences(),
    });
    const payload = ticket.getPayload() as TokenPayload | undefined;

    if (!payload) {
      throw new UnauthorizedException('Invalid Google identity token');
    }

    return payload;
  }

  private assertGoogleIdentityMatchesTarget(
    googleIdentity: VerifiedGoogleIdentity,
    targetAccount: any,
  ) {
    if (
      googleIdentity.iss &&
      !['accounts.google.com', 'https://accounts.google.com'].includes(
        googleIdentity.iss,
      )
    ) {
      throw new UnauthorizedException('Invalid Google identity issuer');
    }

    if (googleIdentity.email_verified !== true) {
      throw new UnauthorizedException('Google email must be verified');
    }

    const matchesGoogleId =
      googleIdentity.sub && googleIdentity.sub === targetAccount.googleId;
    const matchesEmail =
      googleIdentity.email &&
      targetAccount.email &&
      googleIdentity.email.toLowerCase() === targetAccount.email.toLowerCase();

    if (!matchesGoogleId && !matchesEmail) {
      throw new ForbiddenException('Google identity does not match target account');
    }
  }

  private buildAuthorizationUrl(state: string) {
    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizationUrl.searchParams.set(
      'client_id',
      this.configService.get<string>('GOOGLE_CLIENT_ID') || '',
    );
    authorizationUrl.searchParams.set('redirect_uri', this.getRedirectUri());
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid email profile');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('prompt', 'login');

    return authorizationUrl.toString();
  }

  private normalizeCurrentPageUrl(currentPageUrl?: string) {
    const frontendUrl = new URL(
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000',
    );
    const pageUrl = new URL(currentPageUrl || '/', frontendUrl);

    if (pageUrl.origin !== frontendUrl.origin) {
      throw new BadRequestException('currentPageUrl must be same-origin');
    }

    return pageUrl.toString();
  }

  private signState(payload: SignedSwitchState) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = createHmac('sha256', this.getStateSecret())
      .update(encodedPayload)
      .digest('base64url');

    return `${encodedPayload}.${signature}`;
  }

  private verifyState(state: string): SignedSwitchState {
    if (!state) {
      throw new BadRequestException('Missing SSO switch state');
    }

    const [encodedPayload, signature] = state.split('.');
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid SSO switch state');
    }

    const expectedSignature = createHmac('sha256', this.getStateSecret())
      .update(encodedPayload)
      .digest('base64url');

    if (!this.secureCompare(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid SSO switch state');
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as SignedSwitchState;

    if (new Date(payload.expiresAt).getTime() <= Date.now()) {
      throw new UnauthorizedException('SSO switch state has expired');
    }

    return payload;
  }

  private hashState(state: string) {
    return createHash('sha256').update(state).digest('hex');
  }

  private secureCompare(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private requireDeviceId(deviceId?: string) {
    if (!deviceId) {
      throw new BadRequestException('Missing device id');
    }

    return deviceId;
  }

  private toObjectId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid account id');
    }

    return new Types.ObjectId(id);
  }

  private getRedirectUri() {
    return (
      this.configService.get<string>('GOOGLE_ACCOUNT_SWITCH_REDIRECT_URL') ||
      `http://localhost:${this.configService.get<string>('PORT') || '5512'}/auth/accounts/switch/sso/callback`
    );
  }

  private getGoogleAudiences() {
    return [
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_IOS_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID'),
    ].filter(Boolean) as string[];
  }

  private getStateSecret() {
    return (
      this.configService.get<string>('ACCOUNT_SWITCH_STATE_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'account-switch-state-dev-secret'
    );
  }
}
