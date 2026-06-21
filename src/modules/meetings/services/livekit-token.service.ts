import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';

@Injectable()
export class LivekitTokenService {
  logger: any;
  constructor(
    private readonly configService: ConfigService
  ) {}

  /**
   * Generate a short-lived participant JWT for LiveKit room access.
   *
   * @returns signed JWT string
   */
  async createParticipantToken(params: {
    roomName: string;
    identity: string;
    name: string;
  }): Promise<string> {
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');

    if (!apiKey || !apiSecret) {
      throw new InternalServerErrorException(
        'LiveKit credentials are not configured',
      );
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: params.identity,
      name: params.name,
    });

    token.addGrant({
      room: params.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return await token.toJwt();
  }

  
}
