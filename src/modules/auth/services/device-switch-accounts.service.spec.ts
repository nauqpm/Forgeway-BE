import { Types } from 'mongoose';

import { DeviceSwitchAccountsService } from './device-switch-accounts.service';

describe('DeviceSwitchAccountsService', () => {
  const model = {
    updateOne: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const usersService = {
    getUserById: jest.fn(),
  };
  const tokenService = {
    createAndSaveTokens: jest.fn(),
    revokeSessionTokens: jest.fn(),
  };

  let service: DeviceSwitchAccountsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeviceSwitchAccountsService(
      model as any,
      usersService as any,
      tokenService as any,
    );
  });

  it('upserts an active device switch entry on successful full login', async () => {
    await service.rememberSuccessfulLogin('device-1', {
      id: '6870f6c4c0b8f3c3151e0001',
      email: 'an.tran@gmail.com',
      fullName: 'An Tran',
      avatar: 'https://cdn.example/avatar.png',
      role: 'user',
      ssoProvider: 'google',
    });

    expect(model.updateOne).toHaveBeenCalledWith(
      {
        deviceId: 'device-1',
        userId: new Types.ObjectId('6870f6c4c0b8f3c3151e0001'),
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'active',
          displayName: 'An Tran',
          maskedEmail: 'a***@gmail.com',
          avatarUrl: 'https://cdn.example/avatar.png',
          provider: 'google',
        }),
      }),
      { upsert: true },
    );
  });

  it('marks stale rows expired during list reads and returns current first', async () => {
    model.find.mockReturnValue({
      sort: () => ({
        lean: () => ({
          exec: async () => [
            {
              _id: new Types.ObjectId(),
              deviceId: 'device-1',
              userId: new Types.ObjectId('6870f6c4c0b8f3c3151e0001'),
              displayName: 'Expired User',
              maskedEmail: 'e***@gmail.com',
              avatarUrl: null,
              provider: 'password',
              status: 'active',
              expiresAt: new Date('2026-06-01T00:00:00.000Z'),
              lastAuthenticatedAt: new Date('2026-05-01T00:00:00.000Z'),
              lastSwitchedAt: null,
            },
            {
              _id: new Types.ObjectId(),
              deviceId: 'device-1',
              userId: new Types.ObjectId('6870f6c4c0b8f3c3151e0002'),
              displayName: 'Current User',
              maskedEmail: 'c***@gmail.com',
              avatarUrl: null,
              provider: 'google',
              status: 'active',
              expiresAt: new Date('2099-08-08T00:00:00.000Z'),
              lastAuthenticatedAt: new Date('2026-07-01T00:00:00.000Z'),
              lastSwitchedAt: null,
            },
          ],
        }),
      }),
    });

    const result = await service.listForDevice(
      'device-1',
      '6870f6c4c0b8f3c3151e0002',
    );

    expect(result[0]).toMatchObject({
      userId: '6870f6c4c0b8f3c3151e0002',
      isCurrent: true,
      status: 'active',
    });
    expect(result[1]).toMatchObject({
      userId: '6870f6c4c0b8f3c3151e0001',
      isCurrent: false,
      status: 'expired',
    });
    expect(model.updateOne).toHaveBeenCalledWith(
      {
        deviceId: 'device-1',
        userId: new Types.ObjectId('6870f6c4c0b8f3c3151e0001'),
      },
      { $set: { status: 'expired' } },
    );
  });

  it('marks entries removed instead of deleting them outright', async () => {
    await service.removeForDevice('device-1', '6870f6c4c0b8f3c3151e0003');

    expect(model.updateOne).toHaveBeenCalledWith(
      {
        deviceId: 'device-1',
        userId: new Types.ObjectId('6870f6c4c0b8f3c3151e0003'),
      },
      { $set: { status: 'removed' } },
    );
  });
});
