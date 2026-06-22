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
import { randomUUID } from 'crypto';
import { MeetingDocument, MeetingType } from '../schemas/meeting.schema';
import { MeetingsRepository } from '../meetings.repository';
import { ChannelsService } from '../../chat/services/channels.service';
import { MessagesService } from '../../chat/services/messages.service';
import { RealtimePublisher } from '../../realtime/publishers/realtime.publisher';
import { REALTIME_EVENT_TYPES } from '../../realtime/contracts/realtime-event-types';
import { RoomBuilder } from '../../realtime/contracts/realtime-rooms';
import { LivekitTokenService } from './livekit-token.service';
import { LivekitRoomService } from './livekit-room.service';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';

/** @deprecated LiveKit Cloud manages capacity; kept for backward compat */
const MAX_PARTICIPANTS = 30;

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  /** @deprecated LiveKit Cloud manages capacity */
  get maxParticipants(): number {
    return MAX_PARTICIPANTS;
  }

  constructor(
    private readonly meetingsRepository: MeetingsRepository,
    private readonly channelsService: ChannelsService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
    private readonly realtimePublisher: RealtimePublisher,
    private readonly configService: ConfigService,
    private readonly livekitTokenService: LivekitTokenService,
    private readonly livekitRoomService: LivekitRoomService,
    @Inject(forwardRef(() => WorkspacesService))
    private readonly workspacesService: WorkspacesService,
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

    const roomName = `ws_${channel.workspaceId ?? 'general'}_meeting_${randomUUID()}`;

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

    try {
      await this.livekitRoomService.createRoom({
        roomName,
        meetingId: meeting._id.toString(),
        channelId,
        workspaceId: channel.workspaceId?.toString(),
        maxParticipants: this.maxParticipants,
      });
    } catch (error) {
      meeting.status = 'ended';
      meeting.endedAt = new Date();
      await meeting.save();

      throw error;
    }

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

  async leave(meetingId: string, userId: string) {
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

    const participant = meeting.participants.find(
      p => p.userId.toString() === userId,
    );
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    participant.leftAt = new Date();
    await meeting.save();

    // nếu là người cuối cùng rời khỏi cuộc họp thì kết thúc cuộc họp
  }

  /**
   * Issue a LiveKit connection token for a meeting participant.
   * Verifies channel membership before issuing.
   */
  async requestConnectionDetailsToJoin(
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
    // const isHost = meeting.createdBy.toString() === userId;
    const existingParticipant = meeting.participants.find(
      p => p.userId.toString() === userId,
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

    // Determine if the user can end the meeting
    const channel = await this.channelsService.findById(
      meeting.channelId.toString(),
    );
    let channelOwnerId = channel.createdBy?.toString();

    if (channel.workspaceId) {
      try {
        const workspace = await this.workspacesService.findById(
          channel.workspaceId.toString(),
        );
        if (workspace) {
          channelOwnerId = workspace.ownerId?.toString();
        }
      } catch (e) {
        this.logger.warn(
          `Failed to fetch workspace for channel owner resolution: ${e}`,
        );
      }
    }

    const canEndMeeting =
      meeting.createdBy.toString() === userId || channelOwnerId === userId;

    return {
      serverUrl: this.configService.get<string>('LIVEKIT_URL'),
      roomName,
      participantName: userDisplayName || userId,
      participantToken,
      canEndMeeting,
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

  async handleRoomFinished(roomName: string) {
    try {
      // End the meeting in DB by finding it via roomName
      const meeting = await this.meetingsRepository.model
        .findOne({ roomName, status: { $in: ['waiting', 'active'] } })
        .exec();
      if (meeting) {
        meeting.status = 'ended';
        meeting.endedAt = new Date();
        await meeting.save();
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle room_finished for ${roomName}: ${(error as Error).message}`,
      );
    }
  }

  async endMeeting(meetingId: string, userId: string) {
    if (!Types.ObjectId.isValid(meetingId)) {
      throw new NotFoundException('Invalid Meeting ID');
    }

    const meeting = await this.meetingsRepository.model.findById(meetingId);
    if (!meeting || meeting.status === 'ended') {
      throw new BadRequestException('Meeting already ended or not found');
    }

    const channel = await this.channelsService.findById(
      meeting.channelId.toString(),
    );
    let channelOwnerId = channel.createdBy?.toString();

    if (channel.workspaceId) {
      try {
        const workspace = await this.workspacesService.findById(
          channel.workspaceId.toString(),
        );
        if (workspace) {
          channelOwnerId = workspace.ownerId?.toString();
        }
      } catch (e) {
        this.logger.warn(
          `Failed to fetch workspace for channel owner resolution: ${e}`,
        );
      }
    }

    // Authorization: only meeting creator or channel creator/workspace owner can end it
    if (meeting.createdBy.toString() !== userId && channelOwnerId !== userId) {
      throw new ForbiddenException(
        'Only the meeting creator or channel owner can end this meeting',
      );
    }

    if (meeting.roomName) {
      // Delete the room from LiveKit server
      try {
        await this.livekitRoomService.deleteRoom(meeting.roomName);
      } catch (err) {
        this.logger.warn(
          `Failed to delete LiveKit room: ${(err as Error).message}`,
        );
      }
    }

    meeting.status = 'ended';
    meeting.endedAt = new Date();
    await meeting.save();

    return meeting;
  }
}
