import { DeviceSwitchAccountsService } from './device-switch-accounts.service';
import {
  LoginSessionTrackingInput,
  LoginSessionTrackingService,
} from './login-session-tracking.service';

describe('LoginSessionTrackingService', () => {
  const deviceSwitchAccountsService = {
    rememberSuccessfulLogin: jest.fn(),
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
    deviceId: 'existing-device-id',
    ip: '203.0.113.10',
    userAgent: 'test-agent',
  };
  let service: LoginSessionTrackingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LoginSessionTrackingService(
      deviceSwitchAccountsService as unknown as DeviceSwitchAccountsService,
    );
  });

  it('stores the successful login against the device switch registry', async () => {
    await expect(service.trackLoginSession(input)).resolves.toEqual({
      generatedDeviceId: undefined,
    });

    expect(
      deviceSwitchAccountsService.rememberSuccessfulLogin,
    ).toHaveBeenCalledWith(
      input.deviceId,
      expect.objectContaining({ id: 'account-2', ssoProvider: 'google' }),
      { ip: input.ip, userAgent: input.userAgent },
    );
  });

  it('generates a device ID when none is provided', async () => {
    const generateDeviceId = jest
      .spyOn(LoginSessionTrackingService, 'generateDeviceId')
      .mockReturnValue('generated-device-id');

    const result = await service.trackLoginSession({
      ...input,
      deviceId: undefined,
    });

    expect(result).toEqual({ generatedDeviceId: 'generated-device-id' });
    expect(
      deviceSwitchAccountsService.rememberSuccessfulLogin,
    ).toHaveBeenCalledWith(
      'generated-device-id',
      expect.any(Object),
      expect.any(Object),
    );
    generateDeviceId.mockRestore();
  });

  it('keeps registry write failures non-fatal', async () => {
    deviceSwitchAccountsService.rememberSuccessfulLogin.mockRejectedValue(
      new Error('device switch registry unavailable'),
    );

    await expect(service.trackLoginSession(input)).resolves.toEqual({
      generatedDeviceId: undefined,
    });
  });
});
