import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoomServiceClient } from 'livekit-server-sdk';

@Injectable()
export class LivekitRoomService {
  private readonly logger = new Logger(LivekitRoomService.name);
  private readonly roomServiceClient: RoomServiceClient;

  constructor(private readonly configService: ConfigService) {
    this.roomServiceClient = new RoomServiceClient(
      this.configService.get<string>('LIVEKIT_URL') || 'http://localhost:7880',
      this.configService.get<string>('LIVEKIT_API_KEY') || 'devkey',
      this.configService.get<string>('LIVEKIT_API_SECRET') || 'secret',
    );
  }

  async createRoom(params: {
    roomName: string;
    meetingId: string;
    channelId: string;
    workspaceId?: string;
    maxParticipants?: number;
  }) {
    const {
      roomName,
      meetingId,
      channelId,
      workspaceId,
      maxParticipants = 30,
    } = params;

    try {
      return await this.roomServiceClient.createRoom({
        name: roomName,

        // Room tồn tại tối đa bao lâu nếu chưa ai join.
        emptyTimeout: Number(
          this.configService.get<string>('MEETING_EMPTY_TIMEOUT_SECONDS') ??
            300,
        ),

        // Room giữ lại bao lâu sau khi người cuối cùng rời đi.
        departureTimeout: Number(
          this.configService.get<string>('MEETING_DEPARTURE_TIMEOUT_SECONDS') ??
            60,
        ),

        maxParticipants,

        metadata: JSON.stringify({
          meetingId,
          channelId,
          workspaceId,
        }),
      });
    } catch (error) {
      const message = (error as Error).message ?? '';

      // Tránh fail nếu room đã tồn tại do retry hoặc race condition.
      if (
        message.toLowerCase().includes('already exists') ||
        message.toLowerCase().includes('already_exist')
      ) {
        this.logger.warn(`LiveKit room already exists: ${roomName}`);
        return null;
      }

      this.logger.error(
        `Failed to create LiveKit room ${roomName}: ${message}`,
        (error as Error).stack,
      );

      throw new BadRequestException('Failed to create LiveKit room');
    }
  }

  async deleteRoom(roomName: string) {
    try {
      return await this.roomServiceClient.deleteRoom(roomName);
    } catch (error) {
      const message = (error as Error).message ?? '';

      this.logger.error(
        `Failed to delete LiveKit room ${roomName}: ${message}`,
        (error as Error).stack,
      );

      throw new BadRequestException('Failed to delete LiveKit room');
    }
  }

  async listParticipants(roomName: string) {
    try {
      return await this.roomServiceClient.listParticipants(roomName);
    } catch (error) {
      const message = (error as Error).message ?? '';

      this.logger.error(
        `Failed to list participants in LiveKit room ${roomName}: ${message}`,
        (error as Error).stack,
      );

      throw new BadRequestException('Failed to list LiveKit participants');
    }
  }

  async removeParticipant(roomName: string, identity: string) {
    try {
      return await this.roomServiceClient.removeParticipant(roomName, identity);
    } catch (error) {
      const message = (error as Error).message ?? '';

      this.logger.error(
        `Failed to remove participant ${identity} from room ${roomName}: ${message}`,
        (error as Error).stack,
      );

      throw new BadRequestException('Failed to remove LiveKit participant');
    }
  }
}
