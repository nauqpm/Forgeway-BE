import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';

import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { AccountSwitchSsoService } from './account-switch-sso.service';

describe('AccountSwitchSsoService', () => {
  const actorUserId = new Types.ObjectId().toString();
  const targetAccountId = new Types.ObjectId().toString();
  const savedAccountModel = {
    findOne: jest.fn(),
  };
  const pendingStateModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  };
  const parkedSessionModel = {
    updateOne: jest.fn(),
  };
  const usersService = {
    getUserById: jest.fn(),
  };
  const tokenService = {
    createAndSaveTokens: jest.fn(),
    hashToken: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        ACCOUNT_SWITCH_STATE_SECRET: 'test-state-secret',
        FRONTEND_URL: 'http://localhost:3000',
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-client-secret',
        GOOGLE_ACCOUNT_SWITCH_REDIRECT_URL:
          'http://localhost:5512/auth/accounts/switch/sso/callback',
      };
      return values[key];
    }),
  };

  let service: AccountSwitchSsoService;

  const activeSsoTarget = {
    _id: { toString: () => targetAccountId },
    email: 'target@example.com',
    googleId: 'google-target-sub',
    password: null,
    role: 'user',
    status: USER_STATUSES.ACTIVE,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    savedAccountModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });
    pendingStateModel.create.mockResolvedValue({});
    pendingStateModel.findOne.mockResolvedValue(null);
    pendingStateModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    parkedSessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    usersService.getUserById.mockResolvedValue(activeSsoTarget);
    tokenService.createAndSaveTokens.mockResolvedValue({
      accessToken: 'target-access-token',
      refreshToken: 'target-refresh-token',
    });
    tokenService.hashToken.mockImplementation((token: string) => `hash:${token}`);

    service = new AccountSwitchSsoService(
      savedAccountModel as any,
      parkedSessionModel as any,
      pendingStateModel as any,
      usersService as any,
      tokenService as any,
      configService as any,
    );
  });

  const buildSignedState = (expiresAt = new Date(Date.now() + 60_000)) => {
    const payload = {
      actorUserId,
      targetAccountId,
      deviceId: 'device-123',
      nonce: 'nonce-123',
      expiresAt: expiresAt.toISOString(),
    };
    const state = (service as any).signState(payload);

    return {
      payload,
      state,
      stateHash: (service as any).hashState(state),
    };
  };

  it('rejects SSO init for a local-password target', async () => {
    usersService.getUserById.mockResolvedValueOnce({
      ...activeSsoTarget,
      password: 'hashed-password',
      googleId: null,
    });

    await expect(
      service.initSwitch(actorUserId, targetAccountId, {
        deviceId: 'device-123',
        currentPageUrl: 'http://localhost:3000/workspace/projects',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(pendingStateModel.create).not.toHaveBeenCalled();
  });

  it('creates a signed SSO state bound to actor, target, and device', async () => {
    const result = await service.initSwitch(actorUserId, targetAccountId, {
      deviceId: 'device-123',
      currentPageUrl: 'http://localhost:3000/workspace/projects',
    });
    const authorizationUrl = new URL(result.authorizationUrl);
    const state = authorizationUrl.searchParams.get('state') as string;
    const statePayload = JSON.parse(
      Buffer.from(state.split('.')[0], 'base64url').toString('utf8'),
    );

    expect(authorizationUrl.origin).toBe('https://accounts.google.com');
    expect(authorizationUrl.searchParams.get('prompt')).toBe('login');
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5512/auth/accounts/switch/sso/callback',
    );
    expect(statePayload).toMatchObject({
      actorUserId,
      targetAccountId,
      deviceId: 'device-123',
    });
    expect(pendingStateModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: expect.any(Types.ObjectId),
        targetAccountId: expect.any(Types.ObjectId),
        deviceId: 'device-123',
        nonce: statePayload.nonce,
        currentPageUrl: 'http://localhost:3000/workspace/projects',
      }),
    );
  });

  it('rejects an external currentPageUrl', async () => {
    await expect(
      service.initSwitch(actorUserId, targetAccountId, {
        deviceId: 'device-123',
        currentPageUrl: 'https://evil.example/phish',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(pendingStateModel.create).not.toHaveBeenCalled();
  });

  it('rejects an expired callback state before minting target tokens', async () => {
    const { state } = buildSignedState(new Date(Date.now() - 60_000));

    await expect(
      service.completeSwitch(state, 'auth-code', { deviceId: 'device-123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects replayed callback state before minting target tokens', async () => {
    const { state, stateHash } = buildSignedState();
    pendingStateModel.findOne.mockResolvedValueOnce({
      _id: new Types.ObjectId(),
      actorUserId: new Types.ObjectId(actorUserId),
      targetAccountId: new Types.ObjectId(targetAccountId),
      nonce: 'nonce-123',
      stateHash,
      currentPageUrl: 'http://localhost:3000/workspace/projects',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
    });

    await expect(
      service.completeSwitch(state, 'auth-code', { deviceId: 'device-123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects callback state from a different device cookie before code exchange', async () => {
    const { state } = buildSignedState();
    const exchangeGoogleCode = jest.spyOn(service as any, 'exchangeGoogleCode');

    await expect(
      service.completeSwitch(state, 'auth-code', { deviceId: 'other-device' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(exchangeGoogleCode).not.toHaveBeenCalled();
    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('rejects Google identity mismatch before minting target tokens', async () => {
    const { state, stateHash } = buildSignedState();
    pendingStateModel.findOne.mockResolvedValueOnce({
      _id: new Types.ObjectId(),
      actorUserId: new Types.ObjectId(actorUserId),
      targetAccountId: new Types.ObjectId(targetAccountId),
      nonce: 'nonce-123',
      stateHash,
      currentPageUrl: 'http://localhost:3000/workspace/projects',
      expiresAt: new Date(Date.now() + 60_000),
    });
    jest.spyOn(service as any, 'exchangeGoogleCode').mockResolvedValueOnce({
      sub: 'other-google-sub',
      email: 'other@example.com',
      email_verified: true,
      iss: 'https://accounts.google.com',
    });

    await expect(
      service.completeSwitch(state, 'auth-code', { deviceId: 'device-123' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tokenService.createAndSaveTokens).not.toHaveBeenCalled();
  });

  it('mints target tokens only after valid Google identity match', async () => {
    const { state, stateHash } = buildSignedState();
    const pendingStateId = new Types.ObjectId();
    pendingStateModel.findOne.mockResolvedValueOnce({
      _id: pendingStateId,
      actorUserId: new Types.ObjectId(actorUserId),
      targetAccountId: new Types.ObjectId(targetAccountId),
      nonce: 'nonce-123',
      stateHash,
      currentPageUrl: 'http://localhost:3000/workspace/projects',
      expiresAt: new Date(Date.now() + 60_000),
    });
    jest.spyOn(service as any, 'exchangeGoogleCode').mockResolvedValueOnce({
      sub: 'google-target-sub',
      email: 'target@example.com',
      email_verified: true,
      iss: 'https://accounts.google.com',
    });

    const result = await service.completeSwitch(state, 'auth-code', {
      deviceId: 'device-123',
    });

    expect(tokenService.createAndSaveTokens).toHaveBeenCalledWith(
      targetAccountId,
      'target@example.com',
      'user',
      undefined,
      undefined,
    );
    expect(parkedSessionModel.updateOne).toHaveBeenCalledWith(
      {
        ownerUserId: expect.any(Types.ObjectId),
        accountId: expect.any(Types.ObjectId),
        deviceId: 'device-123',
      },
      {
        $set: {
          refreshTokenHash: 'hash:target-refresh-token',
          lastUsedAt: expect.any(Date),
        },
      },
      { upsert: true },
    );
    expect(pendingStateModel.updateOne).toHaveBeenCalledWith(
      { _id: pendingStateId, usedAt: { $exists: false } },
      { $set: { usedAt: expect.any(Date) } },
    );
    expect(result).toMatchObject({
      accessToken: 'target-access-token',
      refreshToken: 'target-refresh-token',
      actorUserId,
      targetAccountId,
      currentPageUrl: 'http://localhost:3000/workspace/projects',
    });
  });
});
