import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { RedisService } from '../../../infra/redis/redis.service';
import type { RedisClientType } from 'redis';

export interface SsoUserPayload {
  id: string;
  email: string;
  role: string;
  fullName?: string;
  avatar?: string;
}

@Injectable()
export class SsoLoginService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SsoLoginService.name);
  private redirectRules: { regex: RegExp; isHostnameOnly: boolean }[] = [];
  private redisClient: RedisClientType | null = null;
  private readonly SSO_CODE_TTL = 300; // 5 minutes

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    this.redisClient = await this.redisService.createClient('sso-login');

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const allowedOriginsEnv =
      this.configService.get<string>('ALLOWED_REDIRECT_ORIGINS') || '';

    const patterns = [frontendUrl, ...allowedOriginsEnv.split(',')]
      .map(p => p.trim())
      .filter(Boolean);

    this.redirectRules = patterns.map(pattern => {
      const isHostnameOnly =
        !pattern.startsWith('http://') && !pattern.startsWith('https://');
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regexStr = escaped.replace(/\\\*/g, '.*');
      return {
        regex: new RegExp(`^${regexStr}$`),
        isHostnameOnly,
      };
    });
  }

  async onModuleDestroy() {
    this.redisClient = null;
  }

  isValidRedirectUrl(url: string): boolean {
    if (!url) return true;
    try {
      const parsedUrl = new URL(url);
      return this.redirectRules.some(({ regex, isHostnameOnly }) => {
        return isHostnameOnly
          ? regex.test(parsedUrl.hostname)
          : regex.test(parsedUrl.origin);
      });
    } catch {
      return false;
    }
  }

  async generateAuthorizationCode(
    user: SsoUserPayload,
    redirectUri: string,
  ): Promise<string> {
    if (!this.isValidRedirectUrl(redirectUri)) {
      throw new BadRequestException('URL chuyển hướng không hợp lệ.');
    }

    const code = randomUUID();
    const payload = JSON.stringify({ user, redirectUri });
    const redisKey = `sso_code:${code}`;

    if (this.redisClient) {
      await this.redisClient.set(redisKey, payload, { EX: this.SSO_CODE_TTL });
    } else {
      this.logger.error(
        'Redis client is not available. Cannot generate SSO code.',
      );
      throw new BadRequestException(
        'Dịch vụ SSO tạm thời không khả dụng do thiếu Redis.',
      );
    }

    return code;
  }

  async exchangeCodeForToken(code: string): Promise<string> {
    if (!this.redisClient) {
      throw new BadRequestException(
        'Dịch vụ SSO tạm thời không khả dụng do thiếu Redis.',
      );
    }

    const redisKey = `sso_code:${code}`;
    const storedData = await this.redisClient.get(redisKey);

    if (!storedData) {
      throw new UnauthorizedException(
        'Mã ủy quyền không hợp lệ hoặc đã hết hạn.',
      );
    }

    await this.redisClient.del(redisKey);

    const { user } = JSON.parse(storedData) as {
      user: SsoUserPayload;
      redirectUri: string;
    };

    const tokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      avatar: user.avatar,
    };

    return this.jwtService.sign(tokenPayload, { expiresIn: '1h' });
  }
}
