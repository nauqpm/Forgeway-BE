import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { AUTH_ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { AuthRegistrationService } from './auth-registration.service';

describe('AuthRegistrationService', () => {
  const registerDto = {
    email: 'newuser@example.com',
    password: 'StrongPass1!',
  };

  const usersService = {
    findByEmail: jest.fn(),
    createUser: jest.fn(),
  };
  const verifyService = {
    sendVerificationEmail: jest.fn(),
  };
  const inviteService = {
    processPostRegisterInvites: jest.fn(),
  };

  let service: AuthRegistrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    inviteService.processPostRegisterInvites.mockResolvedValue(undefined);
    service = new AuthRegistrationService(
      usersService as never,
      verifyService as never,
      inviteService as never,
    );
  });

  describe('register', () => {
    beforeEach(() => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.createUser.mockResolvedValue({
        _id: { toString: () => 'new-user-id' },
        email: registerDto.email,
        status: USER_STATUSES.PENDING_VERIFICATION,
      });
      verifyService.sendVerificationEmail.mockResolvedValue(undefined);
    });

    it('creates a pending user for a new email', async () => {
      const result = await service.register(registerDto);

      expect(result).toEqual({
        success: true,
        message:
          'Registration successful. Please check your email to verify your account.',
        email: registerDto.email,
      });
      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerDto.email,
          status: USER_STATUSES.PENDING_VERIFICATION,
        }),
      );
    });

    it('rejects a pending email with EMAIL_NOT_VERIFIED', async () => {
      usersService.findByEmail.mockResolvedValue({
        _id: { toString: () => 'existing-id' },
        email: registerDto.email,
        password: 'hash',
        status: USER_STATUSES.PENDING_VERIFICATION,
      });

      await expect(service.register(registerDto)).rejects.toMatchObject({
        response: {
          message: 'Please verify your email before registering.',
          code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
        },
      });
      expect(usersService.createUser).not.toHaveBeenCalled();
    });

    it('rejects an existing active email with 409 Conflict', async () => {
      usersService.findByEmail.mockResolvedValue({
        _id: { toString: () => 'existing-id' },
        email: registerDto.email,
        password: 'hash',
        status: USER_STATUSES.ACTIVE,
      });

      await expect(service.register(registerDto)).rejects.toMatchObject({
        response: {
          statusCode: 409,
          message: 'Email is already in use.',
        },
      });
      expect(usersService.createUser).not.toHaveBeenCalled();
    });

    it('sends a verification email on successful registration', async () => {
      await service.register(registerDto);

      expect(verifyService.sendVerificationEmail).toHaveBeenCalledWith(
        registerDto.email,
      );
    });

    it('processes post-registration invites non-blockingly using .catch()', async () => {
      usersService.createUser.mockResolvedValue({
        _id: { toString: () => 'new-user-id' },
        email: registerDto.email,
      });
      inviteService.processPostRegisterInvites.mockReturnValue(
        new Promise<void>(() => undefined),
      );

      await expect(service.register(registerDto)).resolves.toMatchObject({
        success: true,
      });

      expect(inviteService.processPostRegisterInvites).toHaveBeenCalledWith(
        registerDto.email,
        'new-user-id',
      );
    });

    it('does not fail registration when invite processing fails', async () => {
      inviteService.processPostRegisterInvites.mockRejectedValue(
        new Error('Invite processing failed'),
      );

      const result = await service.register(registerDto);

      expect(result.success).toBe(true);
    });

    it('preserves the pending user and propagates the error when sendVerificationEmail throws', async () => {
      verifyService.sendVerificationEmail.mockRejectedValue(
        new Error('SMTP connection failed'),
      );

      await expect(service.register(registerDto)).rejects.toThrow(
        'SMTP connection failed',
      );
      expect(usersService.createUser).toHaveBeenCalled();
    });

    it('does not call processPostRegisterInvites when sendVerificationEmail throws', async () => {
      verifyService.sendVerificationEmail.mockRejectedValue(
        new Error('SMTP down'),
      );

      await expect(service.register(registerDto)).rejects.toThrow();

      expect(inviteService.processPostRegisterInvites).not.toHaveBeenCalled();
    });

    it('re-throws non-ConflictException errors from upstream', async () => {
      usersService.createUser.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(service.register(registerDto)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });
});
