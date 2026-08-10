import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AUTH_ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenLookupService } from '../services/token-lookup.service';

describe('JwtAuthGuard', () => {
  const jwtService = {
    verify: jest.fn(),
  };

  const tokenService = {
    findActiveAccessToken: jest.fn(),
  };

  const auditLogService = {
    logRequest: jest.fn(),
  };

  let guard: JwtAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new JwtAuthGuard(
      jwtService as unknown as JwtService,
      tokenService as unknown as TokenLookupService,
      auditLogService as unknown as AuditLogService,
    );
    jwtService.verify.mockReturnValue({
      userId: 'user-1',
      email: 'user@example.com',
      role: 'user',
      type: 'access',
      mustChangePassword: true,
    });
    tokenService.findActiveAccessToken.mockResolvedValue({
      userId: { toString: () => 'user-1' },
    });
  });

  function createContext(method: string, path: string): ExecutionContext {
    const request = {
      method,
      originalUrl: path,
      url: path,
      cookies: {},
      headers: { authorization: 'Bearer access-token' },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  }

  it('blocks protected routes until the password is changed', async () => {
    await expect(
      guard.canActivate(createContext('GET', '/auth/my-permissions')),
    ).rejects.toMatchObject({
      response: {
        error: AUTH_ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
      },
    });
  });

  it('allows the current user password change route', async () => {
    await expect(
      guard.canActivate(createContext('PUT', '/users/me')),
    ).resolves.toBe(true);
  });

  it('allows token refresh while a password change is still required', async () => {
    await expect(
      guard.canActivate(createContext('POST', '/auth/refresh')),
    ).resolves.toBe(true);
  });

  it('does not block users who are not flagged for a required password change', async () => {
    jwtService.verify.mockReturnValue({
      userId: 'user-1',
      email: 'user@example.com',
      role: 'user',
      type: 'access',
      mustChangePassword: false,
    });

    await expect(
      guard.canActivate(createContext('GET', '/auth/my-permissions')),
    ).resolves.toBe(true);
  });
});
