import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { RoomServiceClient } from 'livekit-server-sdk';
import { randomUUID } from 'crypto';
import { MeetingDocument, MeetingType } from '../chat/schemas/meeting.schema';
import { MeetingsRepository } from '../chat/repositories/meetings.repository';
import { ChannelsService } from '../chat/services/channels.service';
import { MessagesService } from '../chat/services/messages.service';
import { LivekitTokenService } from './livekit-token.service';
import { RealtimePublisher } from '../realtime/publishers/realtime.publisher';
import { REALTIME_EVENT_TYPES } from '../realtime/contracts/realtime-event-types';
import { RoomBuilder } from '../realtime/contracts/realtime-rooms';

/** @deprecated LiveKit Cloud manages capacity; kept for backward compat */
const MAX_MESH_CLIENTS = 6;

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  /** @deprecated LiveKit Cloud manages capacity */
  get maxMeshClients(): number {
    return MAX_MESH_CLIENTS;
  }

  constructor(
    private readonly meetingsRepository: MeetingsRepository,
    private readonly channelsService: ChannelsService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
    private readonly realtimePublisher: RealtimePublisher,
    private readonly livekitTokenService: LivekitTokenService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    channelId: string,
    userId: string,
    type: MeetingType = 'video',
  ): Promise<MeetingDocument> {
    if (type !== 'voice' && type !== 'video') {
      throw new BadRequestException('Meeting type must be voice or video');
    }

    const hasAccess = await this.channelsService.validateUserAccess(
      channelId,
      userId,
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this channel');
    }

    const activeMeeting = await this.findActive(channelId);
    if (activeMeeting) {
      throw new BadRequestException(
        'An active meeting already exists in this channel',
      );
    }

    const channel = await this.channelsService.findById(channelId);

    const roomName = `ws_${channel.workspaceId}_meeting_${randomUUID()}`;

    const meeting = await this.meetingsRepository.model.create({
      channelId: new Types.ObjectId(channelId),
      workspaceId: channel.workspaceId,
      createdBy: new Types.ObjectId(userId),
      status: 'waiting',
      type,
      roomName,
      participants: [
        {
          userId: new Types.ObjectId(userId),
          joinedAt: new Date(),
          isAudioOn: true,
          isVideoOn: type === 'video',
          isMuted: false,
        },
      ],
      startedAt: new Date(),
    });

    const message = await this.messagesService.send(channelId, userId, {
      content:
        type === 'voice' ? 'Voice call started' : 'Video meeting started',
      type: 'system',
    });

    await this.channelsService.updateLastMessage(channelId, {
      content: message.content,
      senderId: userId,
      senderName: message.senderId?.fullName || 'System',
      sentAt: message.createdAt,
      type: message.type,
    });

    this.realtimePublisher.emit(
      RoomBuilder.channel(channelId),
      {
        eventId: new Types.ObjectId().toString(),
        type: REALTIME_EVENT_TYPES.CHAT_MESSAGE_SENT,
        data: message,
        occurredAt: new Date().toISOString(),
      },
      '/chat',
    );

    this.realtimePublisher.emit(
      RoomBuilder.channel(channelId),
      {
        eventId: new Types.ObjectId().toString(),
        type: REALTIME_EVENT_TYPES.MEETING_STARTED,
        data: {
          meetingId: meeting._id.toString(),
          channelId,
          type: meeting.type,
        },
        occurredAt: new Date().toISOString(),
      },
      '/chat',
    );

    return meeting;
  }

  async join(
    meetingId: string,
    userId: string,
    options?: { isAudioOn?: boolean; isVideoOn?: boolean },
  ): Promise<MeetingDocument> {
    if (!Types.ObjectId.isValid(meetingId)) {
      throw new NotFoundException('Invalid Meeting ID');
    }

    const meeting = await this.meetingsRepository.model.findById(meetingId);
    if (!meeting || meeting.status === 'ended') {
      throw new NotFoundException('Meeting not found or already ended');
    }

    const hasAccess = await this.channelsService.validateUserAccess(
      meeting.channelId.toString(),
      userId,
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this channel');
    }

    const existingParticipant = meeting.participants.find(
      p => p.userId.toString() === userId,
    );

    if (existingParticipant) {
      let modified = false;
      if (
        options?.isAudioOn !== undefined &&
        existingParticipant.isAudioOn !== options.isAudioOn
      ) {
        existingParticipant.isAudioOn = options.isAudioOn;
        modified = true;
      }
      if (
        options?.isVideoOn !== undefined &&
        existingParticipant.isVideoOn !== options.isVideoOn
      ) {
        existingParticipant.isVideoOn = options.isVideoOn;
        modified = true;
      }

      if (modified) {
        meeting.markModified('participants');
        return meeting.save();
      }
      return meeting;
    }

    meeting.participants.push({
      userId: new Types.ObjectId(userId),
      joinedAt: new Date(),
      isAudioOn: options?.isAudioOn ?? true,
      isVideoOn: options?.isVideoOn ?? meeting.type === 'video',
      isMuted: false,
    });

    if (meeting.status === 'waiting') {
      meeting.status = 'active';
    }

    return meeting.save();
  }

  async leave(meetingId: string, userId: string): Promise<MeetingDocument> {
    if (!Types.ObjectId.isValid(meetingId)) {
      throw new NotFoundException('Invalid Meeting ID');
    }

    const meeting = await this.meetingsRepository.model.findById(meetingId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    meeting.participants = meeting.participants.filter(
      p => p.userId.toString() !== userId,
    );

    return meeting.save();
  }

  async toggleAudio(
    meetingId: string,
    userId: string,
    isOn: boolean,
  ): Promise<void> {
    await this.meetingsRepository.model.updateOne(
      { _id: meetingId, 'participants.userId': new Types.ObjectId(userId) },
      { $set: { 'participants.$.isAudioOn': isOn } },
    );
  }

  async toggleVideo(
    meetingId: string,
    userId: string,
    isOn: boolean,
  ): Promise<void> {
    const meeting = await this.meetingsRepository.model
      .findById(meetingId)
      .select('type')
      .exec();
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    if (meeting.type === 'voice' && isOn) {
      throw new BadRequestException('Voice calls do not support video');
    }

    await this.meetingsRepository.model.updateOne(
      { _id: meetingId, 'participants.userId': new Types.ObjectId(userId) },
      { $set: { 'participants.$.isVideoOn': isOn } },
    );
  }

  async end(meetingId: string, userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(meetingId)) {
      throw new NotFoundException('Invalid Meeting ID');
    }

    const meeting = await this.meetingsRepository.model.findById(meetingId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Only createdBy or WORKSPACE_ADMIN can end
    if (meeting.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the creator can end the meeting');
    }

    // Kick all participants from LiveKit room
    if (meeting.roomName) {
      try {
        const livekitUrl = this.configService.get<string>('LIVEKIT_URL') || '';
        const apiKey = this.configService.get<string>('LIVEKIT_API_KEY') || '';
        const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET') || '';
        const host = livekitUrl.replace('wss://', 'https://');
        const roomService = new RoomServiceClient(host, apiKey, apiSecret);
        await roomService.deleteRoom(meeting.roomName);
      } catch (error) {
        this.logger.warn(
          `Failed to delete LiveKit room ${meeting.roomName}: ${(error as Error).message}`,
        );
      }
    }

    meeting.status = 'ended';
    meeting.endedAt = new Date();
    await meeting.save();
  }

  /**
   * Issue a LiveKit connection token for a meeting participant.
   * Verifies channel membership before issuing.
   */
  async getConnectionDetails(
    meetingId: string,
    userId: string,
    userDisplayName: string,
  ) {
    if (!Types.ObjectId.isValid(meetingId)) {
      throw new NotFoundException('Invalid Meeting ID');
    }

    const meeting = await this.meetingsRepository.model.findById(meetingId);
    if (!meeting || meeting.status === 'ended') {
      throw new NotFoundException('Meeting not found or already ended');
    }

    // Authorization: check channel membership
    const hasAccess = await this.channelsService.validateUserAccess(
      meeting.channelId.toString(),
      userId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        'You are not a member of the channel for this meeting',
      );
    }

    const roomName = meeting.roomName;
    if (!roomName) {
      throw new NotFoundException('Meeting has no LiveKit room configured');
    }

    const identity = `${userId}:${roomName}`;

    // Upsert participant record
    const isHost = meeting.createdBy.toString() === userId;
    const existingParticipant = meeting.participants.find(
      (p) => p.userId.toString() === userId,
    );
    if (!existingParticipant) {
      meeting.participants.push({
        userId: new Types.ObjectId(userId),
        joinedAt: new Date(),
        isAudioOn: true,
        isVideoOn: meeting.type === 'video',
        isMuted: false,
      });
      if (meeting.status === 'waiting') {
        meeting.status = 'active';
      }
      await meeting.save();
    }

    const participantToken =
      await this.livekitTokenService.createParticipantToken({
        roomName,
        identity,
        name: userDisplayName || userId,
      });

    return {
      serverUrl: this.configService.get<string>('LIVEKIT_URL'),
      roomName,
      participantName: userDisplayName || userId,
      participantToken,
    };
  }

  async findActive(channelId: string): Promise<MeetingDocument | null> {
    if (!Types.ObjectId.isValid(channelId)) {
      return null;
    }
    return this.meetingsRepository.model
      .findOne({
        channelId: new Types.ObjectId(channelId),
        status: { $in: ['waiting', 'active'] },
      })
      .exec();
  }

  async findById(meetingId: string): Promise<MeetingDocument> {
    if (!Types.ObjectId.isValid(meetingId)) {
      throw new NotFoundException('Invalid Meeting ID');
    }

    const meeting = await this.meetingsRepository.model
      .findById(meetingId)
      .exec();
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    return meeting;
  }

  async findByRoomName(roomName: string): Promise<MeetingDocument | null> {
    if (!roomName) return null;
    return this.meetingsRepository.model.findOne({ roomName }).exec();
  }

  async findActiveByParticipant(userId: string): Promise<MeetingDocument[]> {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }
    return this.meetingsRepository.model
      .find({
        'participants.userId': new Types.ObjectId(userId),
        status: { $in: ['waiting', 'active'] },
      })
      .exec();
  }
}
