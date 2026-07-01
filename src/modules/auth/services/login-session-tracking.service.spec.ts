import { AccountSwitcherService } from './account-switcher.service';
import {
  LoginSessionTrackingInput,
  LoginSessionTrackingService,
} from './login-session-tracking.service';
import { RecentLoginsService } from './recent-logins.service';
import { TokenService } from './token.service';

describe('LoginSessionTrackingService', () => {
  const tokenService = {
    peekUserIdFromAccessToken: jest.fn(),
  };
  const accountSwitcherService = {
    rememberAccount: jest.fn(),
  };
  const recentLoginsService = {
    remember: jest.fn(),
  };
  const input: LoginSessionTrackingInput = {
    loggedInUser: {
      id: 'account-2',
      email: 'user@example.com',
      fullName: 'Test User',
      avatar: 'avatar.png',
      role: 'user',
      ssoProvider: 'google',
    },
    existingAccessToken: 'existing-access-token',
    deviceId: 'existing-device-id',
    ip: '203.0.113.10',
    userAgent: 'test-agent',
  };
  let service: LoginSessionTrackingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LoginSessionTrackingService(
      tokenService as unknown as TokenService,
      accountSwitcherService as unknown as AccountSwitcherService,
      recentLoginsService as unknown as RecentLoginsService,
    );
  });

  it('remembers a different session owner and the recent login', async () => {
    tokenService.peekUserIdFromAccessToken.mockReturnValue('owner-1');

    await expect(service.trackLoginSession(input)).resolves.toEqual({
      generatedDeviceId: undefined,
    });

    expect(accountSwitcherService.rememberAccount).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({ id: 'account-2', ssoProvider: 'google' }),
      { ip: input.ip, userAgent: input.userAgent },
    );
    expect(recentLoginsService.remember).toHaveBeenCalledWith(
      input.deviceId,
      expect.objectContaining({ id: 'account-2' }),
      { ip: input.ip, userAgent: input.userAgent },
    );
  });

  it('does not save an account-switch entry for the same owner', async () => {
    tokenService.peekUserIdFromAccessToken.mockReturnValue('account-2');

    await service.trackLoginSession(input);

    expect(accountSwitcherService.rememberAccount).not.toHaveBeenCalled();
    expect(recentLoginsService.remember).toHaveBeenCalledTimes(1);
  });

  it('does not save an account-switch entry without a session owner', async () => {
    tokenService.peekUserIdFromAccessToken.mockReturnValue(undefined);

    await service.trackLoginSession(input);

    expect(accountSwitcherService.rememberAccount).not.toHaveBeenCalled();
    expect(recentLoginsService.remember).toHaveBeenCalledTimes(1);
  });

  it('generates a device ID when none is provided', async () => {
    const generateDeviceId = jest
      .spyOn(RecentLoginsService, 'generateDeviceId')
      .mockReturnValue('generated-device-id');

    const result = await service.trackLoginSession({
      ...input,
      deviceId: undefined,
    });

    expect(result).toEqual({ generatedDeviceId: 'generated-device-id' });
    expect(recentLoginsService.remember).toHaveBeenCalledWith(
      'generated-device-id',
      expect.any(Object),
      expect.any(Object),
    );
    generateDeviceId.mockRestore();
  });

  it('keeps account switcher and recent-login failures non-fatal', async () => {
    tokenService.peekUserIdFromAccessToken.mockReturnValue('owner-1');
    accountSwitcherService.rememberAccount.mockRejectedValue(
      new Error('account switcher unavailable'),
    );
    recentLoginsService.remember.mockRejectedValue(
      new Error('recent logins unavailable'),
    );

    await expect(service.trackLoginSession(input)).resolves.toEqual({
      generatedDeviceId: undefined,
    });
    expect(recentLoginsService.remember).toHaveBeenCalledTimes(1);
  });
});
