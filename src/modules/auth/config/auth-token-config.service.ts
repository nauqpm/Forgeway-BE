import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  parsePositiveTtlSeconds,
  secondsToJwtExpiresIn,
} from './auth-token-config.util';

@Injectable()
export class AuthTokenConfigService {
  constructor(private readonly configService: ConfigService) {}

  get jwtSecret(): string {
    return this.configService.get<string>('JWT_SECRET') ?? '';
  }

  get refreshTokenSecret(): string {
    return this.configService.get<string>('REFRESH_TOKEN_SECRET') ?? '';
  }

  get accessTokenTtlSeconds(): number {
    return parsePositiveTtlSeconds(
      this.configService.get<string>('ACCESS_TOKEN_TTL_SECONDS'),
      'ACCESS_TOKEN_TTL_SECONDS',
      DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
    );
  }

  get refreshTokenTtlSeconds(): number {
    return parsePositiveTtlSeconds(
      this.configService.get<string>('REFRESH_TOKEN_TTL_SECONDS'),
      'REFRESH_TOKEN_TTL_SECONDS',
      DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
    );
  }

  get accessTokenJwtExpiresIn(): string {
    return secondsToJwtExpiresIn(this.accessTokenTtlSeconds);
  }

  get refreshTokenJwtExpiresIn(): string {
    return secondsToJwtExpiresIn(this.refreshTokenTtlSeconds);
  }

  getAccessTokenExpiresAt(now = Date.now()): Date {
    return new Date(now + this.accessTokenTtlSeconds * 1000);
  }

  getRefreshTokenExpiresAt(now = Date.now()): Date {
    return new Date(now + this.refreshTokenTtlSeconds * 1000);
  }
}
