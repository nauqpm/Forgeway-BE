import {
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { hashToken } from '../utils/token-hash.util';
import { TokenRevocationService } from './token-revocation.service';

describe('TokenRevocationService', () => {
  const tokenModel = {
    updateMany: jest.fn(),
    updateOne: jest.fn(),
  };

  let service: TokenRevocationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TokenRevocationService(tokenModel as never);
  });

  it('revokes access and refresh session tokens by hash', async () => {
    tokenModel.updateMany.mockResolvedValue({});

    const result = await service.revokeSessionTokens(
      'access-token',
      'refresh-token',
    );

    expect(result.message).toContain('thành công');
    expect(tokenModel.updateMany).toHaveBeenCalledWith(
      {
        token: {
          $in: [hashToken('access-token'), hashToken('refresh-token')],
        },
      },
      { status: false },
    );
  });

  it('rejects revokeSessionTokens when both tokens are missing', async () => {
    await expect(service.revokeSessionTokens()).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tokenModel.updateMany).not.toHaveBeenCalled();
  });

  it('maps Mongo unavailable errors while revoking a session', async () => {
    const error = new Error('db unavailable');
    error.name = 'MongoServerSelectionError';
    tokenModel.updateMany.mockRejectedValue(error);

    await expect(service.revokeSessionTokens('access-token')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('maps generic revoke session errors to InternalServerErrorException', async () => {
    tokenModel.updateMany.mockRejectedValue(new Error('boom'));

    await expect(service.revokeSessionTokens('access-token')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('invalidates one token by hash', async () => {
    tokenModel.updateOne.mockResolvedValue({});

    await service.invalidateToken('access-token');

    expect(tokenModel.updateOne).toHaveBeenCalledWith(
      { token: hashToken('access-token') },
      { status: false },
    );
  });

  it('maps invalidateToken errors to InternalServerErrorException', async () => {
    tokenModel.updateOne.mockRejectedValue(new Error('boom'));

    await expect(service.invalidateToken('access-token')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('invalidates all tokens for a user', async () => {
    tokenModel.updateMany.mockResolvedValue({});

    await service.invalidateAllTokensForUser('account-a');

    expect(tokenModel.updateMany).toHaveBeenCalledWith(
      { userId: 'account-a' },
      { status: false },
    );
  });

  it('maps invalidateAllTokensForUser errors to InternalServerErrorException', async () => {
    tokenModel.updateMany.mockRejectedValue(new Error('boom'));

    await expect(
      service.invalidateAllTokensForUser('account-a'),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
