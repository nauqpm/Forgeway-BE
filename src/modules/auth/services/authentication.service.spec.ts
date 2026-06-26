import { UnauthorizedException } from '@nestjs/common';
import { AUTH_ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { LoginRetryLaterException } from '../security/login-retry-later.exception';
import { AuthenticationService } from './authentication.service';

describe('AuthenticationService progressive login delay', () => {
  const loginDto = {
    email: 'user@example.com',
    password: 'Password@123',
  };
  const requestContext = { ip: '203.0.113.10' };

  const usersService = {
    findByEmail: jest.fn(),
    resetLoginFailures: jest.fn(),
  };
  const passwordService = {
    hashPassword: jest.fn(),
    verifyPassword: jest.fn(),
  };
  const tokenService = {
    createAndSaveTokens: jest.fn(),
  };
  const loginAttemptThrottleService = {
    getRetryAfterSeconds: jest.fn(),
    registerFailure: jest.fn(),
    clear: jest.fn(),
  };

  let service: AuthenticationService;

  beforeEach(() => {
    jest.clearAllMocks();
    loginAttemptThrottleService.getRetryAfterSeconds.mockResolvedValue(0);
    loginAttemptThrottleService.registerFailure.mockResolvedValue({
      emailAttempts: 1,
      ipAttempts: 1,
      retryAfterSeconds: 0,
    });
    service = new AuthenticationService(
      usersService as never,
      passwordService,
      tokenService as never,
      {} as never,
      {} as never,
      loginAttemptThrottleService as never,
    );
  });

  it('rejects an active cooldown before querying the user', async () => {
    loginAttemptThrottleService.getRetryAfterSeconds.mockResolvedValue(4);

    await expect(service.login(loginDto, requestContext)).rejects.toEqual(
      expect.any(LoginRetryLaterException),
    );
    expect(usersService.findByEmail).not.toHaveBeenCalled();
  });

  it('uses the generic failure contract for an unknown account', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    passwordService.hashPassword.mockResolvedValue('dummy-hash');
    passwordService.verifyPassword.mockResolvedValue(false);
    loginAttemptThrottleService.registerFailure.mockResolvedValue({
      emailAttempts: 5,
      ipAttempts: 5,
      retryAfterSeconds: 1,
    });

    const promise = service.login(loginDto, requestContext);

    await expect(promise).rejects.toMatchObject({
      response: {
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        details: { retryAfterSeconds: 1 },
      },
    });
    expect(passwordService.verifyPassword).toHaveBeenCalledWith(
      loginDto.password,
      'dummy-hash',
    );
    expect(loginAttemptThrottleService.registerFailure).toHaveBeenCalled();
  });

  it('records a wrong password without using legacy DB lockout', async () => {
    usersService.findByEmail.mockResolvedValue(createActiveUser());
    passwordService.verifyPassword.mockResolvedValue(false);

    await expect(service.login(loginDto, requestContext)).rejects.toEqual(
      expect.any(UnauthorizedException),
    );
    expect(loginAttemptThrottleService.registerFailure).toHaveBeenCalled();
    expect(usersService.resetLoginFailures).not.toHaveBeenCalled();
  });

  it('clears progressive delay state after a successful login', async () => {
    usersService.findByEmail.mockResolvedValue(createActiveUser());
    passwordService.verifyPassword.mockResolvedValue(true);
    tokenService.createAndSaveTokens.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    await expect(
      service.login(loginDto, requestContext),
    ).resolves.toMatchObject({
      success: true,
      user: { id: 'user-id' },
    });
    expect(loginAttemptThrottleService.clear).toHaveBeenCalledWith({
      email: loginDto.email,
      ip: requestContext.ip,
    });
  });

  function createActiveUser() {
    return {
      _id: { toString: () => 'user-id' },
      email: loginDto.email,
      password: 'stored-hash',
      role: 'user',
      fullName: 'Test User',
      avatar: null,
      googleId: null,
      status: USER_STATUSES.ACTIVE,
      failedLoginAttempts: 0,
      lockoutUntil: null,
    };
  }
});
