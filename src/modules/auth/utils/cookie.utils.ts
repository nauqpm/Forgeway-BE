import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

import {
  getAccessCookieOptions,
  getDeviceCookieOptions,
  getRefreshCookieOptions,
} from '../../../config/cookie.config';
import { COOKIE_NAMES } from '../constants/cookie.constants';

const DEVICE_COOKIE_SEPARATOR = '.';

function getDeviceIdSecret(configService: ConfigService): string {
  return (
    configService.get<string>('DEVICE_ID_SECRET') ||
    configService.get<string>('ACCOUNT_SWITCH_STATE_SECRET') ||
    configService.get<string>('JWT_SECRET') ||
    'device-id-dev-secret'
  );
}

function signDeviceId(configService: ConfigService, deviceId: string): string {
  return createHmac('sha256', getDeviceIdSecret(configService))
    .update(deviceId)
    .digest('base64url');
}

function getSignedDeviceIdCookieValue(
  configService: ConfigService,
  deviceId: string,
): string {
  return `${deviceId}${DEVICE_COOKIE_SEPARATOR}${signDeviceId(configService, deviceId)}`;
}

function verifySignedDeviceId(
  configService: ConfigService,
  value: string,
): string | null {
  const separatorIndex = value.lastIndexOf(DEVICE_COOKIE_SEPARATOR);
  if (separatorIndex <= 0) {
    return value;
  }

  const deviceId = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  const expected = signDeviceId(configService, deviceId);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  return timingSafeEqual(signatureBuffer, expectedBuffer) ? deviceId : null;
}

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
    getSignedDeviceIdCookieValue(configService, deviceId),
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
}, configService?: ConfigService): string | null {
  const v = req.cookies?.[COOKIE_NAMES.DEVICE];
  if (typeof v !== 'string' || v.length === 0) {
    return null;
  }
  return configService ? verifySignedDeviceId(configService, v) : v;
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
