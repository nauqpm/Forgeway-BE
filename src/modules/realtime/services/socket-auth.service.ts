import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { parse } from 'cookie';

import { COOKIE_NAMES } from '../../auth/constants/cookie.constants';
import { TOKEN_TYPES } from '../../auth/constants/token.constants';
import { TokenService } from '../../auth/services/token.service';
import { JwtPayload } from '../../auth/types/jwt-payload.type';
import { AuthenticatedSocket, SocketUser } from '../contracts';

@Injectable()
export class SocketAuthService {
  private readonly logger = new Logger(SocketAuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
  ) {}

  async authenticate(client: AuthenticatedSocket): Promise<SocketUser> {
    const token = this.extractAccessToken(client);
    if (!token) {
      throw new WsException('Access token missing');
    }

    const payload = await this.verifyAccessToken(token);
    await this.ensureTokenIsActive(token, payload);

    const user: SocketUser = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };

    client.data.user = user;
    this.scheduleDisconnectAtTokenExpiry(client, payload.exp);

    return user;
  }

  clearDisconnectTimer(client: AuthenticatedSocket): void {
    if (!client.data.disconnectTimer) {
      return;
    }

    clearTimeout(client.data.disconnectTimer);
    delete client.data.disconnectTimer;
  }

  private extractAccessToken(client: AuthenticatedSocket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return authToken.trim();
    }

    const authorizationHeader = client.handshake.headers.authorization;
    if (authorizationHeader?.startsWith('Bearer ')) {
      return authorizationHeader.slice('Bearer '.length).trim();
    }

    const cookies = parse(client.handshake.headers.cookie ?? '');
    return cookies[COOKIE_NAMES.ACCESS];
  }

  private async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      if (!payload.userId) {
        throw new WsException('Invalid access token payload');
      }

      if (payload.type && payload.type !== TOKEN_TYPES.ACCESS) {
        throw new WsException('Only access tokens can open realtime sockets');
      }

      return payload;
    } catch (error) {
      if (error instanceof WsException) {
        throw error;
      }

      throw new WsException((error as Error).message || 'Invalid access token');
    }
  }

  private async ensureTokenIsActive(
    token: string,
    payload: JwtPayload,
  ): Promise<void> {
    const activeToken = await this.tokenService.findActiveAccessToken(token);
    if (!activeToken || activeToken.userId.toString() !== payload.userId) {
      throw new WsException('Access token revoked or not found');
    }
  }

  private scheduleDisconnectAtTokenExpiry(
    client: AuthenticatedSocket,
    expiresAtSeconds?: number,
  ): void {
    this.clearDisconnectTimer(client);

    if (!expiresAtSeconds) {
      this.logger.warn(
        `Realtime client ${client.id} has no token expiration claim.`,
      );
      return;
    }

    const delayMs = expiresAtSeconds * 1000 - Date.now();
    if (delayMs <= 0) {
      client.disconnect(true);
      return;
    }

    client.data.disconnectTimer = setTimeout(() => {
      const user = client.data.user;
      const userIdentifier = user?.email
        ? `${user.email} (${user.userId})`
        : user?.userId || 'unknown';
      this.logger.log(
        `Disconnecting realtime client ${client.id} | User: ${userIdentifier} because access token expired.`,
      );
      client.disconnect(true);
    }, delayMs);
  }
}
