import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';

import {
  getAccessCookieOptions,
  getDeviceCookieOptions,
  getRefreshCookieOptions,
} from '../../../config/cookie.config';
import { COOKIE_NAMES } from '../constants/cookie.constants';

export function setAccessTokenCookie(
  res: Response,
  configService: ConfigService,
  accessToken: string,
): void {
  res.cookie(
    COOKIE_NAMES.ACCESS,
    accessToken,
    getAccessCookieOptions(configService),
  );
}

export function setRefreshTokenCookie(
  res: Response,
  configService: ConfigService,
  refreshToken: string,
): void {
  res.cookie(
    COOKIE_NAMES.REFRESH,
    refreshToken,
    getRefreshCookieOptions(configService),
  );
}

export function setDeviceIdCookie(
  res: Response,
  configService: ConfigService,
  deviceId: string,
): void {
  res.cookie(
    COOKIE_NAMES.DEVICE,
    deviceId,
    getDeviceCookieOptions(configService),
  );
}

export function setAuthCookies(
  res: Response,
  configService: ConfigService,
  tokens: { accessToken: string; refreshToken: string },
): void {
  setAccessTokenCookie(res, configService, tokens.accessToken);
  setRefreshTokenCookie(res, configService, tokens.refreshToken);
}

/**
 * Đọc device id từ cookie. Trả về null nếu chưa có — caller tự quyết định có sinh mới hay không.
 */
export function getDeviceIdFromRequest(req: {
  cookies?: Record<string, unknown>;
}): string | null {
  const v = req.cookies?.[COOKIE_NAMES.DEVICE];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Preserve existing clear options behavior from AuthController.logout
 */
export function clearAuthCookies(
  res: Response,
  configService: ConfigService,
): void {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const clearOptions: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
  };

  res.clearCookie(COOKIE_NAMES.ACCESS, clearOptions);
  res.clearCookie(COOKIE_NAMES.REFRESH, clearOptions);
}
