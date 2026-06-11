import { ConfigService } from '@nestjs/config';

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  maxAge: number;
  path: string;
  domain?: string;
}

const BASE_COOKIE_OPTIONS = (
  configService: ConfigService,
): Omit<CookieOptions, 'maxAge'> => {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    domain: isProduction
      ? configService.get<string>('COOKIE_DOMAIN')
      : undefined,
  };
};

// Access token cookie: khớp với JWT_EXPIRES_IN (mặc định 15m)
export const getAccessCookieOptions = (
  configService: ConfigService,
): CookieOptions => ({
  ...BASE_COOKIE_OPTIONS(configService),
  maxAge: 15 * 60 * 1000, // 15 phút
});

// Refresh token cookie: 7 ngày
export const getRefreshCookieOptions = (
  configService: ConfigService,
): CookieOptions => ({
  ...BASE_COOKIE_OPTIONS(configService),
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
});

// Backward-compat alias
export const getCookieOptions = getAccessCookieOptions;

export const JWT_COOKIE_NAME = 'access_token';
export const REFRESH_COOKIE_NAME = 'refresh_token';
