import { ConfigService } from '@nestjs/config';
import { getDeviceIdFromRequest, setDeviceIdCookie } from './cookie.utils';
import { COOKIE_NAMES } from '../constants/cookie.constants';

describe('Cookie Utils', () => {
  let mockConfigService: jest.Mocked<ConfigService>;
  
  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'DEVICE_ID_SECRET') return 'test-secret';
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;
  });

  describe('getDeviceIdFromRequest', () => {
    it('should return null if cookie is missing', () => {
      const req = { cookies: {} };
      expect(getDeviceIdFromRequest(req, mockConfigService)).toBeNull();
    });

    it('should return legacy cookie value directly if no signature separator is present', () => {
      const req = { cookies: { [COOKIE_NAMES.DEVICE]: 'legacy-device-id' } };
      expect(getDeviceIdFromRequest(req, mockConfigService)).toBe('legacy-device-id');
    });

    it('should return legacy cookie value directly if configService is not provided', () => {
      const req = { cookies: { [COOKIE_NAMES.DEVICE]: 'legacy-device-id' } };
      expect(getDeviceIdFromRequest(req)).toBe('legacy-device-id');
    });

    it('should verify signature and return device ID if valid', () => {
      // First, let's create a valid signed cookie
      const mockRes = {
        cookie: jest.fn(),
      } as any;
      setDeviceIdCookie(mockRes, mockConfigService, 'my-device-id');
      const cookieValue = mockRes.cookie.mock.calls[0][1];
      
      const req = { cookies: { [COOKIE_NAMES.DEVICE]: cookieValue } };
      expect(getDeviceIdFromRequest(req, mockConfigService)).toBe('my-device-id');
    });

    it('should return null if signature is invalid', () => {
      const req = { cookies: { [COOKIE_NAMES.DEVICE]: 'my-device-id.invalidsignature' } };
      expect(getDeviceIdFromRequest(req, mockConfigService)).toBeNull();
    });

    it('should handle missing secret gracefully by falling back', () => {
      mockConfigService.get.mockReturnValue(undefined);
      
      const mockRes = { cookie: jest.fn() } as any;
      setDeviceIdCookie(mockRes, mockConfigService, 'my-device-id');
      const cookieValue = mockRes.cookie.mock.calls[0][1];
      
      const req = { cookies: { [COOKIE_NAMES.DEVICE]: cookieValue } };
      expect(getDeviceIdFromRequest(req, mockConfigService)).toBe('my-device-id');
    });
  });
});
