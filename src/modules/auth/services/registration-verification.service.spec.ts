import { UnauthorizedException } from '@nestjs/common';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { VerifyType } from '../../verify/dtos/verify.dto';
import { RegistrationVerificationService } from './registration-verification.service';

describe('RegistrationVerificationService', () => {
  const email = 'user@example.com';
  const code = '123456';

  const usersService = {
    findByEmail: jest.fn(),
    updateUser: jest.fn(),
  };
  const verifyService = {
    verifyCode: jest.fn(),
    sendVerificationEmail: jest.fn(),
  };

  let service: RegistrationVerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RegistrationVerificationService(
      usersService as never,
      verifyService as never,
    );
  });

  function createActiveUser(overrides: Record<string, unknown> = {}) {
    return {
      _id: { toString: () => 'user-id' },
      email,
      status: USER_STATUSES.ACTIVE,
      ...overrides,
    };
  }

  // =========================================================================
  // Verification
  // =========================================================================
  describe('verifyRegistrationEmail', () => {
    beforeEach(() => {
      verifyService.verifyCode.mockResolvedValue({
        valid: true,
        message: 'Verification successful',
      });
    });

    it('calls verifyCode with VerifyType.VERIFICATION', async () => {
      usersService.findByEmail.mockResolvedValue(createActiveUser());

      await service.verifyRegistrationEmail(email, code);

      expect(verifyService.verifyCode).toHaveBeenCalledWith(
        email,
        code,
        VerifyType.VERIFICATION,
      );
    });

    it('does not call findByEmail if verifyCode fails', async () => {
      verifyService.verifyCode.mockRejectedValue(
        new Error('Invalid or expired verification code'),
      );

      await expect(
        service.verifyRegistrationEmail(email, code),
      ).rejects.toThrow();
      expect(usersService.findByEmail).not.toHaveBeenCalled();
    });

    it('activates a pending account with a valid verification code', async () => {
      const pendingUser = createActiveUser({
        status: USER_STATUSES.PENDING_VERIFICATION,
      });
      usersService.findByEmail.mockResolvedValue(pendingUser);
      usersService.updateUser.mockResolvedValue({
        ...pendingUser,
        status: USER_STATUSES.ACTIVE,
      });

      const result = await service.verifyRegistrationEmail(email, code);

      expect(result).toEqual({
        success: true,
        message: 'Email verification successful.',
      });
      expect(usersService.updateUser).toHaveBeenCalledWith('user-id', {
        status: USER_STATUSES.ACTIVE,
      });
    });

    it('does not update an already active account', async () => {
      usersService.findByEmail.mockResolvedValue(createActiveUser());

      const result = await service.verifyRegistrationEmail(email, code);

      expect(result).toEqual({
        success: true,
        message: 'Email verification successful.',
      });
      expect(usersService.updateUser).not.toHaveBeenCalled();
    });

    it('throws 401 when verifyCode succeeds but user is not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.verifyRegistrationEmail(email, code),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('propagates updateUser error', async () => {
      usersService.findByEmail.mockResolvedValue(
        createActiveUser({ status: USER_STATUSES.PENDING_VERIFICATION }),
      );
      usersService.updateUser.mockRejectedValue(
        new Error('Database update failed'),
      );

      await expect(
        service.verifyRegistrationEmail(email, code),
      ).rejects.toThrow('Database update failed');
    });
  });

  // =========================================================================
  // Resend Verification
  // =========================================================================
  describe('resendRegistrationVerification', () => {
    const genericResponse = {
      success: true,
      message:
        'If the email requires verification, new instructions have been sent.',
    };

    it('sends a verification email for a pending account', async () => {
      usersService.findByEmail.mockResolvedValue(
        createActiveUser({ status: USER_STATUSES.PENDING_VERIFICATION }),
      );
      verifyService.sendVerificationEmail.mockResolvedValue(undefined);

      const result = await service.resendRegistrationVerification(
        'pending@example.com',
      );

      expect(result).toEqual(genericResponse);
      expect(verifyService.sendVerificationEmail).toHaveBeenCalledWith(
        'pending@example.com',
      );
    });

    it('returns the generic response for a non-existent email without sending', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.resendRegistrationVerification(
        'nonexistent@example.com',
      );

      expect(result).toEqual(genericResponse);
      expect(verifyService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns the generic response for an already active account without sending', async () => {
      usersService.findByEmail.mockResolvedValue(createActiveUser());

      const result =
        await service.resendRegistrationVerification('active@example.com');

      expect(result).toEqual(genericResponse);
      expect(verifyService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns generic response for banned/inactive account without sending', async () => {
      usersService.findByEmail.mockResolvedValue(
        createActiveUser({ status: USER_STATUSES.BANNED }),
      );

      const result =
        await service.resendRegistrationVerification('banned@example.com');

      expect(result).toEqual(genericResponse);
      expect(verifyService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('propagates email sending error', async () => {
      usersService.findByEmail.mockResolvedValue(
        createActiveUser({ status: USER_STATUSES.PENDING_VERIFICATION }),
      );
      verifyService.sendVerificationEmail.mockRejectedValue(
        new Error('SMTP connection failed'),
      );

      await expect(
        service.resendRegistrationVerification('pending@example.com'),
      ).rejects.toThrow('SMTP connection failed');
    });

    it('returns identical generic response for all non-pending cases', async () => {
      usersService.findByEmail
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createActiveUser());

      const missingResult = await service.resendRegistrationVerification(
        'missing@example.com',
      );
      const activeResult =
        await service.resendRegistrationVerification('active@example.com');

      expect(missingResult).toEqual(genericResponse);
      expect(activeResult).toEqual(genericResponse);
      expect(missingResult).toEqual(activeResult);
    });
  });
});
