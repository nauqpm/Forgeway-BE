import { InternalServerErrorException } from '@nestjs/common';
import { TOKEN_TYPES } from '../constants/token.constants';
import { hashToken } from '../utils/token-hash.util';
import { TokenLookupService } from './token-lookup.service';

describe('TokenLookupService', () => {
  const tokenModel = {
    findOne: jest.fn(),
  };

  let service: TokenLookupService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TokenLookupService(tokenModel as never);
  });

  describe('findActiveAccessToken', () => {
    it('finds active access token by hash', async () => {
      const tokenDoc = { token: 'hashed', userId: 'account-a' };
      tokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(tokenDoc),
      });

      await expect(service.findActiveAccessToken('access-token')).resolves.toBe(
        tokenDoc,
      );
      expect(tokenModel.findOne).toHaveBeenCalledWith({
        token: hashToken('access-token'),
        status: true,
        type: TOKEN_TYPES.ACCESS,
      });
    });

    it('maps lookup errors to InternalServerErrorException', async () => {
      tokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockRejectedValue(new Error('db error')),
      });

      await expect(
        service.findActiveAccessToken('access-token'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('findActiveRefreshToken', () => {
    it('finds active refresh token by hash', async () => {
      const tokenDoc = { token: 'hashed', userId: 'account-a' };
      tokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(tokenDoc),
      });

      await expect(
        service.findActiveRefreshToken('refresh-token'),
      ).resolves.toBe(tokenDoc);
      expect(tokenModel.findOne).toHaveBeenCalledWith({
        token: hashToken('refresh-token'),
        status: true,
        type: TOKEN_TYPES.REFRESH,
      });
    });

    it('maps lookup errors to InternalServerErrorException', async () => {
      tokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockRejectedValue(new Error('db error')),
      });

      await expect(
        service.findActiveRefreshToken('refresh-token'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('findToken', () => {
    it('finds legacy token by hash', async () => {
      const tokenDoc = { token: 'hashed', userId: 'account-a' };
      tokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(tokenDoc),
      });

      await expect(service.findToken('token')).resolves.toBe(tokenDoc);
      expect(tokenModel.findOne).toHaveBeenCalledWith({
        token: hashToken('token'),
        status: true,
      });
    });

    it('maps lookup errors to InternalServerErrorException', async () => {
      tokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockRejectedValue(new Error('db error')),
      });

      await expect(service.findToken('token')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
