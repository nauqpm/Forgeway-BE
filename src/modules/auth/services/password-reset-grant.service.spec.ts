import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { TOKEN_TYPES } from '../constants/token.constants';
import { hashToken } from '../utils/token-hash.util';
import { PasswordResetGrantService } from './password-reset-grant.service';

describe('PasswordResetGrantService', () => {
  const tokenModel = {
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
  };

  let service: PasswordResetGrantService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PasswordResetGrantService(tokenModel as never);
  });

  describe('createResetGrant', () => {
    it('stores a hashed reset grant with expiry', async () => {
      tokenModel.create.mockResolvedValue({});

      const result = await service.createResetGrant('account-a', 'a@test.com');

      expect(result.resetGrant).toEqual(expect.any(String));
      expect(result.expiresInMs).toBe(10 * 60 * 1000);
      expect(tokenModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'account-a',
          email: 'a@test.com',
          token: hashToken(result.resetGrant),
          deviceInfo: 'Password Reset Grant',
          status: true,
          type: TOKEN_TYPES.PASSWORD_RESET_GRANT,
          expiresAt: expect.any(Date),
        }),
      );
      expect(tokenModel.create.mock.calls[0][0].token).not.toBe(
        result.resetGrant,
      );
    });
  });

  describe('consumeResetGrant', () => {
    it('marks an active reset grant inactive and returns email', async () => {
      tokenModel.findOneAndUpdate.mockResolvedValue({
        email: 'a@test.com',
        userId: 'account-a',
      });

      await expect(service.consumeResetGrant('grant')).resolves.toEqual({
        email: 'a@test.com',
      });
      expect(tokenModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          token: hashToken('grant'),
          status: true,
          type: TOKEN_TYPES.PASSWORD_RESET_GRANT,
          expiresAt: { $gt: expect.any(Date) },
        },
        { $set: { status: false } },
        { new: false },
      );
    });

    it('rejects empty reset grants', async () => {
      await expect(service.consumeResetGrant('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects invalid, expired, or reused reset grants', async () => {
      tokenModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(service.consumeResetGrant('grant')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('validateResetGrant', () => {
    it('returns the grant email without consuming it', async () => {
      tokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ email: 'a@test.com' }),
      });

      await expect(service.validateResetGrant('grant')).resolves.toEqual({
        email: 'a@test.com',
      });
      expect(tokenModel.findOne).toHaveBeenCalledWith({
        token: hashToken('grant'),
        status: true,
        type: TOKEN_TYPES.PASSWORD_RESET_GRANT,
        expiresAt: { $gt: expect.any(Date) },
      });
      expect(tokenModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects empty reset grants', async () => {
      await expect(service.validateResetGrant('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects invalid, expired, or reused reset grants', async () => {
      tokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.validateResetGrant('grant')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
