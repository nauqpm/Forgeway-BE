import { ConflictException } from '@nestjs/common';
import { DeviceSwitchAccountsController } from './device-switch-accounts.controller';
import { DeviceSwitchAccountsService } from '../services/device-switch-accounts.service';
import * as cookieUtils from '../utils/cookie.utils';

jest.mock('../utils/cookie.utils', () => ({
  getDeviceIdFromRequest: jest.fn(),
  setAuthCookies: jest.fn(),
}));

describe('DeviceSwitchAccountsController', () => {
  const service = {
    listForDevice: jest.fn(),
    switchToDeviceAccount: jest.fn(),
    removeForDevice: jest.fn(),
  };

  let controller: DeviceSwitchAccountsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DeviceSwitchAccountsController(
      service as unknown as DeviceSwitchAccountsService,
      { get: jest.fn() } as any,
    );
  });

  it('returns an empty list when the session is authenticated but deviceId is missing', async () => {
    (cookieUtils.getDeviceIdFromRequest as jest.Mock).mockReturnValue(null);

    await expect(
      controller.list({ user: { userId: 'user-1' }, cookies: {} } as any),
    ).resolves.toEqual([]);
    expect(service.listForDevice).not.toHaveBeenCalled();
  });

  it('rotates cookies and returns success when switching to an active device account', async () => {
    (cookieUtils.getDeviceIdFromRequest as jest.Mock).mockReturnValue(
      'device-1',
    );
    service.switchToDeviceAccount.mockResolvedValue({
      success: true,
      redirectTo: '/',
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      switchedUser: { id: 'user-2', displayName: 'An Tran' },
    });

    const result = await controller.switch(
      {
        user: { userId: 'user-1' },
        cookies: { refresh_token: 'current-refresh' },
        headers: { 'user-agent': 'jest' },
      } as any,
      {} as any,
      { targetUserId: '6870f6c4c0b8f3c3151e0002' },
    );

    expect(cookieUtils.setAuthCookies).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      redirectTo: '/',
      switchedUser: { id: 'user-2', displayName: 'An Tran' },
    });
  });

  it('throws ConflictException with REQUIRES_FULL_LOGIN for expired rows', async () => {
    (cookieUtils.getDeviceIdFromRequest as jest.Mock).mockReturnValue(
      'device-1',
    );
    service.switchToDeviceAccount.mockResolvedValue({
      success: false,
      code: 'REQUIRES_FULL_LOGIN',
      targetUserId: '6870f6c4c0b8f3c3151e0002',
      provider: 'google',
      redirectTo:
        '/login?intent=switch-renew&targetUserId=6870f6c4c0b8f3c3151e0002&provider=google',
    });

    await expect(
      controller.switch(
        { user: { userId: 'user-1' }, cookies: {}, headers: {} } as any,
        {} as any,
        { targetUserId: '6870f6c4c0b8f3c3151e0002' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
