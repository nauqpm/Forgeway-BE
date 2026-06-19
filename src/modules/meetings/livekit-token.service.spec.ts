import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LivekitTokenService } from './livekit-token.service';
import { InternalServerErrorException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

describe('LivekitTokenService', () => {
  let service: LivekitTokenService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LivekitTokenService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'LIVEKIT_API_KEY') return 'test-key';
              if (key === 'LIVEKIT_API_SECRET') return 'test-secret';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LivekitTokenService>(LivekitTokenService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createParticipantToken', () => {
    it('should throw an error if credentials are not configured', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(null);

      await expect(
        service.createParticipantToken({
          roomName: 'test-room',
          identity: 'test-user',
          name: 'Test User',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should generate a valid JWT token with correct grants', async () => {
      const tokenString = await service.createParticipantToken({
        roomName: 'test-room',
        identity: 'test-user',
        name: 'Test User',
      });

      expect(typeof tokenString).toBe('string');

      const decoded = jwt.decode(tokenString) as jwt.JwtPayload;
      expect(decoded).toBeDefined();
      expect(decoded.sub).toBe('test-user');
      expect(decoded.name).toBe('Test User');
      expect(decoded.iss).toBe('test-key');
      expect(decoded.video).toBeDefined();
      expect(decoded.video.room).toBe('test-room');
      expect(decoded.video.roomJoin).toBe(true);
      expect(decoded.video.canPublish).toBe(true);
      expect(decoded.video.canSubscribe).toBe(true);
    });
  });
});
