import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AUTH_ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { UsersService } from '../../users/services/users.service';
import { LoginAttemptThrottleService } from '../security/login-attempt-throttle.service';
import { LoginRetryLaterException } from '../security/login-retry-later.exception';
import { CredentialLoginService } from './credential-login.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

describe('CredentialLoginService', () => {
  const loginDto = {
    email: 'user@example.com',
    password: 'Password@123',
  };
  const requestContext = { ip: '203.0.113.10' };

  const usersService = {
    findByEmail: jest.fn(),
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

  let service: CredentialLoginService;

  beforeEach(() => {
    jest.clearAllMocks();
    loginAttemptThrottleService.getRetryAfterSeconds.mockResolvedValue(0);
    loginAttemptThrottleService.registerFailure.mockResolvedValue({
      emailAttempts: 1,
      ipAttempts: 1,
      retryAfterSeconds: 0,
    });
    service = new CredentialLoginService(
      usersService as never,
      passwordService,
      tokenService as never,
      loginAttemptThrottleService as never,
    );
  });

  function createActiveUser(overrides: Record<string, unknown> = {}) {
    return {
      _id: { toString: () => 'user-id' },
      email: loginDto.email,
      password: 'stored-hash',
      role: 'user',
      fullName: 'Test User',
      avatar: null,
      googleId: null,
      status: USER_STATUSES.ACTIVE,
      ...overrides,
    };
  }

  // =========================================================================
  // Login — Cooldown & Enumeration Protection
  // =========================================================================
  describe('login — cooldown & enumeration protection', () => {
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
    });

    it('uses dummy comparison for OAuth-only accounts and returns same error shape', async () => {
      usersService.findByEmail.mockResolvedValue(
        createActiveUser({ password: null, googleId: 'google-123' }),
      );
      passwordService.hashPassword.mockResolvedValue('dummy-hash');
      passwordService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login(loginDto, requestContext),
      ).rejects.toMatchObject({
        response: {
          code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        },
      });
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        loginDto.password,
        expect.any(String),
      );
      expect(loginAttemptThrottleService.registerFailure).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Login — Email Validation
  // =========================================================================
  describe('login — email validation', () => {
    it('rejects email with whitespace using BadRequestException', async () => {
      const dtoWithWhitespace = {
        email: 'user @example.com',
        password: 'Pass1234!',
      };

      await expect(
        service.login(dtoWithWhitespace, requestContext),
      ).rejects.toMatchObject({
        response: {
          statusCode: 400,
          message: 'Email không được chứa khoảng trắng.',
        },
      });
    });
  });

  // =========================================================================
  // Login — Account Status
  // =========================================================================
  describe('login — account status validation', () => {
    beforeEach(() => {
      passwordService.verifyPassword.mockResolvedValue(true);
    });

    it('throws EMAIL_NOT_VERIFIED for a pending account', async () => {
      usersService.findByEmail.mockResolvedValue(
        createActiveUser({ status: USER_STATUSES.PENDING_VERIFICATION }),
      );

      await expect(
        service.login(loginDto, requestContext),
      ).rejects.toMatchObject({
        response: {
          code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
        },
      });
      expect(loginAttemptThrottleService.clear).not.toHaveBeenCalled();
    });

    it('throws accountSuspended for a banned account', async () => {
      usersService.findByEmail.mockResolvedValue(
        createActiveUser({ status: USER_STATUSES.BANNED }),
      );

      await expect(
        service.login(loginDto, requestContext),
      ).rejects.toMatchObject({
        response: {
          code: AUTH_ERROR_CODES.USER_SUSPENDED,
        },
      });
    });

    it('throws accountDeactivated for an inactive account', async () => {
      usersService.findByEmail.mockResolvedValue(
        createActiveUser({ status: USER_STATUSES.INACTIVE }),
      );

      await expect(
        service.login(loginDto, requestContext),
      ).rejects.toMatchObject({
        response: {
          code: AUTH_ERROR_CODES.USER_DEACTIVATED,
        },
      });
    });
  });

  // =========================================================================
  // Login — Success
  // =========================================================================
  describe('login — success', () => {
    beforeEach(() => {
      usersService.findByEmail.mockResolvedValue(createActiveUser());
      passwordService.verifyPassword.mockResolvedValue(true);
      tokenService.createAndSaveTokens.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('clears progressive delay state after a successful login', async () => {
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

    it('creates tokens with correct user metadata on success', async () => {
      const userWithGoogle = createActiveUser({
        fullName: 'Test User',
        avatar: 'avatar.png',
        googleId: 'google-123',
      });
      usersService.findByEmail.mockResolvedValue(userWithGoogle);

      const result = await service.login(loginDto, requestContext);

      expect(result.user).toEqual({
        id: 'user-id',
        email: loginDto.email,
        role: 'user',
        fullName: 'Test User',
        avatar: 'avatar.png',
        googleId: 'google-123',
        ssoProvider: 'google',
      });
      expect(tokenService.createAndSaveTokens).toHaveBeenCalledWith(
        'user-id',
        loginDto.email,
        'user',
        'Test User',
        'avatar.png',
      );
    });
  });

  // =========================================================================
  // Login — Error handling
  // =========================================================================
  describe('login — error handling', () => {
    it('rethrows system errors without converting them', async () => {
      usersService.findByEmail.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(service.login(loginDto, requestContext)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('produces INVALID_CREDENTIALS for an unknown user', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      passwordService.hashPassword.mockResolvedValue('dummy');
      passwordService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login(loginDto, requestContext),
      ).rejects.toMatchObject({
        response: { code: AUTH_ERROR_CODES.INVALID_CREDENTIALS },
      });
    });

    it('produces INVALID_CREDENTIALS for an OAuth-only account', async () => {
      usersService.findByEmail.mockResolvedValue(
        createActiveUser({ password: null, googleId: 'google-123' }),
      );
      passwordService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login(loginDto, requestContext),
      ).rejects.toMatchObject({
        response: { code: AUTH_ERROR_CODES.INVALID_CREDENTIALS },
      });
    });

    it('produces INVALID_CREDENTIALS for a wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(createActiveUser());
      passwordService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login(loginDto, requestContext),
      ).rejects.toMatchObject({
        response: { code: AUTH_ERROR_CODES.INVALID_CREDENTIALS },
      });
    });
  });

  // =========================================================================
  // Lifecycle — onModuleInit & Dummy Hash Initialization
  // =========================================================================
  describe('lifecycle — onModuleInit & dummy hash', () => {
    async function createInitializedModule() {
      const moduleRef = await Test.createTestingModule({
        providers: [
          CredentialLoginService,
          { provide: UsersService, useValue: usersService },
          { provide: PasswordService, useValue: passwordService },
          { provide: TokenService, useValue: tokenService },
          {
            provide: LoginAttemptThrottleService,
            useValue: loginAttemptThrottleService,
          },
        ],
      }).compile();

      await moduleRef.init();
      return moduleRef;
    }

    it('pre-computes dummy hash through the Nest provider lifecycle', async () => {
      passwordService.hashPassword.mockResolvedValue('precomputed-hash');

      const moduleRef = await createInitializedModule();

      expect(passwordService.hashPassword).toHaveBeenCalledTimes(1);
      await moduleRef.close();
    });

    it('reuses the pre-computed dummy hash across unknown-user requests', async () => {
      passwordService.hashPassword.mockResolvedValue('precomputed-hash');
      const moduleRef = await createInitializedModule();
      const initializedService = moduleRef.get(CredentialLoginService);

      usersService.findByEmail.mockResolvedValue(null);
      passwordService.verifyPassword.mockResolvedValue(false);

      await expect(
        initializedService.login(loginDto, requestContext),
      ).rejects.toThrow();

      expect(passwordService.hashPassword).toHaveBeenCalledTimes(1);
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        loginDto.password,
        'precomputed-hash',
      );

      // Second unknown-user request reuses same hash
      await expect(
        initializedService.login(loginDto, requestContext),
      ).rejects.toThrow();

      expect(passwordService.hashPassword).toHaveBeenCalledTimes(1);
      await moduleRef.close();
    });
  });
});
