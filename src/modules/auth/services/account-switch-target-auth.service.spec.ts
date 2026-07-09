import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';

import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { LoginRetryLaterException } from '../security/login-retry-later.exception';
import { AccountSwitchTargetAuthService } from './account-switch-target-auth.service';

describe('AccountSwitchTargetAuthService', () => {
  const targetAccountId = new Types.ObjectId().toString();
  const targetUser = {
    _id: { toString: () => targetAccountId },
    email: 'target@example.com',
    password: 'hashed-password',
    role: 'user',
    status: USER_STATUSES.ACTIVE,
  };
  const usersService = {
    getUserById: jest.fn(),
  };
  const passwordService = {
    verifyPassword: jest.fn(),
  };
  const loginAttemptThrottleService = {
    getRetryAfterSeconds: jest.fn(),
    registerFailure: jest.fn(),
    clear: jest.fn(),
  };
  const securityAlertService = {
    sendTargetLockoutEmail: jest.fn(),
  };
  const auditLogService = {
    log: jest.fn(),
  };

  let service: AccountSwitchTargetAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    usersService.getUserById.mockResolvedValue(targetUser);
    passwordService.verifyPassword.mockResolvedValue(false);
    loginAttemptThrottleService.getRetryAfterSeconds.mockResolvedValue(0);
    loginAttemptThrottleService.registerFailure.mockResolvedValue({
      emailAttempts: 1,
      ipAttempts: 1,
      retryAfterSeconds: 0,
    });
    loginAttemptThrottleService.clear.mockResolvedValue(undefined);
    securityAlertService.sendTargetLockoutEmail.mockResolvedValue(true);

    service = new AccountSwitchTargetAuthService(
      usersService as any,
      passwordService as any,
      loginAttemptThrottleService as any,
      securityAlertService as any,
      auditLogService as any,
    );
  });

  const verifyWrongPassword = () =>
    service.verifyTargetCredential(
      targetAccountId,
      { type: 'password', password: 'wrong' },
      { ip: '203.0.113.10', deviceId: 'device-123' },
    );

  it('does not send a lockout email below the lock threshold', async () => {
    await expect(verifyWrongPassword()).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(securityAlertService.sendTargetLockoutEmail).not.toHaveBeenCalled();
    expect(auditLogService.log).not.toHaveBeenCalled();
  });

  it('sends one lockout email when a wrong switch password triggers lockout', async () => {
    loginAttemptThrottleService.registerFailure.mockResolvedValueOnce({
      emailAttempts: 5,
      ipAttempts: 1,
      retryAfterSeconds: 30,
    });

    await expect(verifyWrongPassword()).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(securityAlertService.sendTargetLockoutEmail).toHaveBeenCalledTimes(
      1,
    );
    expect(securityAlertService.sendTargetLockoutEmail).toHaveBeenCalledWith({
      targetEmail: 'target@example.com',
      ip: '203.0.113.10',
      deviceId: 'device-123',
    });
    expect(auditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ACCOUNT_SWITCH_FAILED',
        severity: 'WARN',
        userId: targetAccountId,
        email: 'target@example.com',
        metadata: expect.objectContaining({
          triggeredVia: 'account-switch',
          targetUserId: targetAccountId,
          notificationSent: true,
          reason: 'target-lockout',
        }),
      }),
    );
  });

  it('does not resend lockout email while the target remains locked', async () => {
    loginAttemptThrottleService.getRetryAfterSeconds.mockResolvedValueOnce(30);

    await expect(verifyWrongPassword()).rejects.toBeInstanceOf(
      LoginRetryLaterException,
    );

    expect(passwordService.verifyPassword).not.toHaveBeenCalled();
    expect(loginAttemptThrottleService.registerFailure).not.toHaveBeenCalled();
    expect(securityAlertService.sendTargetLockoutEmail).not.toHaveBeenCalled();
  });

  it('sends lockout email once across the unlocked to locked transition and the next locked attempt', async () => {
    loginAttemptThrottleService.getRetryAfterSeconds
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(30);
    loginAttemptThrottleService.registerFailure.mockResolvedValueOnce({
      emailAttempts: 5,
      ipAttempts: 1,
      retryAfterSeconds: 30,
    });

    await expect(verifyWrongPassword()).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(verifyWrongPassword()).rejects.toBeInstanceOf(
      LoginRetryLaterException,
    );

    expect(securityAlertService.sendTargetLockoutEmail).toHaveBeenCalledTimes(
      1,
    );
    expect(loginAttemptThrottleService.registerFailure).toHaveBeenCalledTimes(
      1,
    );
  });

  it('audits notificationSent=false when the lockout email fails', async () => {
    loginAttemptThrottleService.registerFailure.mockResolvedValueOnce({
      emailAttempts: 5,
      ipAttempts: 1,
      retryAfterSeconds: 30,
    });
    securityAlertService.sendTargetLockoutEmail.mockResolvedValueOnce(false);

    await expect(verifyWrongPassword()).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(auditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          triggeredVia: 'account-switch',
          targetUserId: targetAccountId,
          notificationSent: false,
          reason: 'target-lockout',
        }),
      }),
    );
  });
});
