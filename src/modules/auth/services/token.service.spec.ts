import { Test, TestingModule } from '@nestjs/testing';
import { TokenService } from './token.service';
import { getModelToken } from '@nestjs/mongoose';
import { Token } from '../schemas/token.schema';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenConfigService } from '../config/auth-token-config.service';
import { UsersService } from '../../users/services/users.service';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { TOKEN_TYPES } from '../constants/token.constants';
import { UnauthorizedException } from '@nestjs/common';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';

describe('TokenService', () => {
  let service: TokenService;
  let mockTokenModel: any;
  let mockJwtService: any;
  let mockConfig: any;
  let mockUsersService: any;
  let mockAudit: any;

  beforeEach(async () => {
    mockTokenModel = {
      findOneAndUpdate: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      findOne: jest.fn(),
    };
    mockJwtService = {
      verify: jest.fn(),
      sign: jest.fn(),
    };
    mockConfig = {
      getAccessTokenExpiresAt: jest.fn().mockReturnValue(new Date()),
      getRefreshTokenExpiresAt: jest.fn().mockReturnValue(new Date()),
    };
    mockUsersService = {
      getUserById: jest.fn(),
    };
    mockUsersService.getUserById.mockResolvedValue({
      _id: 'user1',
      status: USER_STATUSES.ACTIVE,
      email: 'test@example.com',
      role: 'user',
    });
    mockAudit = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: getModelToken(Token.name), useValue: mockTokenModel },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AuthTokenConfigService, useValue: mockConfig },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuditLogService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  describe('peekUserIdFromAccessToken', () => {
    it('should extract userId without verifying expiry', () => {
      mockJwtService.verify.mockReturnValue({
        type: TOKEN_TYPES.ACCESS,
        userId: 'test-user-id'
      });
      const result = service.peekUserIdFromAccessToken('dummy-token');
      expect(result).toBe('test-user-id');
      expect(mockJwtService.verify).toHaveBeenCalledWith('dummy-token', { ignoreExpiration: true });
    });

    it('should return null on error without throwing', () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('Invalid signature'); });
      const result = service.peekUserIdFromAccessToken('dummy-token');
      expect(result).toBeNull();
    });
  });

  describe('rotateRefreshTokenByHash', () => {
    it('should throw REAUTH_REQUIRED if token is not found or already consumed', async () => {
      mockTokenModel.findOneAndUpdate.mockResolvedValue(null);
      await expect(service.rotateRefreshTokenByHash('hash123', 'user1')).rejects.toThrow(UnauthorizedException);
    });

    it('should revoke entire family and throw REAUTH_REQUIRED if revoked token is reused (outside grace period)', async () => {
      mockTokenModel.findOneAndUpdate.mockResolvedValue(null);
      // Simulate revoked token found
      mockTokenModel.findOne.mockResolvedValue({
        familyId: 'stolen-family',
        updatedAt: new Date(Date.now() - 20_000) // 20s ago (outside 15s grace period)
      });
      
      await expect(service.rotateRefreshTokenByHash('stolen-hash', 'user1')).rejects.toThrow(UnauthorizedException);
      
      expect(mockTokenModel.updateMany).toHaveBeenCalledWith(
        { familyId: 'stolen-family', status: true },
        { $set: { status: false } }
      );
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({
        type: 'TOKEN_FAMILY_REVOKED',
        severity: 'CRITICAL',
      }));
    });

    it('should log REFRESH_REUSED if revoked token is reused within grace period', async () => {
      mockTokenModel.findOneAndUpdate.mockResolvedValue(null);
      // Simulate revoked token found
      mockTokenModel.findOne.mockResolvedValue({
        familyId: 'grace-family',
        updatedAt: new Date(Date.now() - 5_000) // 5s ago (within 15s grace period)
      });
      
      await expect(service.rotateRefreshTokenByHash('stolen-hash', 'user1')).rejects.toThrow(UnauthorizedException);
      
      expect(mockTokenModel.updateMany).not.toHaveBeenCalledWith(
        { familyId: 'grace-family', status: true },
        { $set: { status: false } }
      );
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({
        type: 'REFRESH_REUSED',
        severity: 'WARN',
      }));
    });

    it('should rotate token successfully', async () => {
      mockTokenModel.findOneAndUpdate.mockResolvedValue({ familyId: 'fam1' });
      mockJwtService.sign.mockReturnValue('new-token-string');
      
      const result = await service.rotateRefreshTokenByHash('hash123', 'user1');
      
      expect(result.success).toBe(true);
      expect(mockTokenModel.updateMany).toHaveBeenCalled();
      expect(mockTokenModel.create).toHaveBeenCalledTimes(2);
    });

    it('should throw REAUTH_REQUIRED for suspended user before consuming refresh token', async () => {
      mockUsersService.getUserById.mockResolvedValueOnce({
        _id: 'user1',
        status: 'suspended',
        email: 'test@example.com',
        role: 'user',
      });

      await expect(service.rotateRefreshTokenByHash('hash123', 'user1')).rejects.toThrow(UnauthorizedException);

      expect(mockTokenModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockTokenModel.create).not.toHaveBeenCalled();
    });
  });
});
