import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LivekitWebhookController } from './livekit-webhook.controller';
import { MeetingService } from './meeting.service';
import { RealtimePublisher } from '../realtime/publishers/realtime.publisher';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';

// Mock WebhookReceiver since it relies on crypto which might be annoying in tests
jest.mock('livekit-server-sdk', () => ({
  WebhookReceiver: jest.fn().mockImplementation(() => ({
    receive: jest.fn().mockResolvedValue({
      event: 'participant_joined',
      room: { name: 'test-room' },
      participant: { identity: 'test-user:test-room' }
    })
  }))
}));

describe('LivekitWebhookController', () => {
  let controller: LivekitWebhookController;
  let meetingService: MeetingService;
  let realtimePublisher: RealtimePublisher;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LivekitWebhookController],
      providers: [
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
        {
          provide: MeetingService,
          useValue: {
            findByRoomName: jest.fn(),
          },
        },
        {
          provide: RealtimePublisher,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<LivekitWebhookController>(LivekitWebhookController);
    meetingService = module.get<MeetingService>(MeetingService);
    realtimePublisher = module.get<RealtimePublisher>(RealtimePublisher);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleWebhook', () => {
    it('should throw UnauthorizedException if Authorization header is missing', async () => {
      const mockReq = { rawBody: Buffer.from('{}') } as any;
      await expect(controller.handleWebhook(mockReq, '')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw BadRequestException if rawBody is missing', async () => {
      const mockReq = {} as any;
      await expect(
        controller.handleWebhook(mockReq, 'valid-auth-header'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should process webhook event successfully', async () => {
      const mockReq = { rawBody: Buffer.from('{}') } as any;
      const result = await controller.handleWebhook(mockReq, 'valid-auth-header');
      expect(result).toEqual({ received: true });
    });
  });
});
