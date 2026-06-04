import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Meeting, MeetingDocument } from '../schemas/meeting.schema';
import { ChannelsService } from './channels.service';

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  constructor(
    @InjectModel(Meeting.name) private readonly meetingModel: Model<MeetingDocument>,
    private readonly channelsService: ChannelsService,
  ) {}

  async create(channelId: string, userId: string): Promise<MeetingDocument> {
    const hasAccess = await this.channelsService.validateUserAccess(channelId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this channel');
    }

    const activeMeeting = await this.findActive(channelId);
    if (activeMeeting) {
      throw new BadRequestException('An active meeting already exists in this channel');
    }

    const channel = await this.channelsService.findById(channelId);

    const meeting = await this.meetingModel.create({
      channelId: new Types.ObjectId(channelId),
      workspaceId: channel.workspaceId,
      createdBy: new Types.ObjectId(userId),
      status: 'waiting',
      participants: [
        {
          userId: new Types.ObjectId(userId),
          joinedAt: new Date(),
          isAudioOn: true,
          isVideoOn: false,
          isMuted: false,
        },
      ],
      startedAt: new Date(),
    });

    return meeting;
  }

  async join(meetingId: string, userId: string): Promise<MeetingDocument> {
    if (!Types.ObjectId.isValid(meetingId)) {
      throw new NotFoundException('Invalid Meeting ID');
    }

    const meeting = await this.meetingModel.findById(meetingId);
    if (!meeting || meeting.status === 'ended') {
      throw new NotFoundException('Meeting not found or already ended');
    }

    const hasAccess = await this.channelsService.validateUserAccess(meeting.channelId.toString(), userId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this channel');
    }

    const isAlreadyIn = meeting.participants.some((p) => p.userId.toString() === userId);
    if (isAlreadyIn) {
      return meeting;
    }

    meeting.participants.push({
      userId: new Types.ObjectId(userId),
      joinedAt: new Date(),
      isAudioOn: true,
      isVideoOn: false,
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

    const meeting = await this.meetingModel.findById(meetingId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    meeting.participants = meeting.participants.filter((p) => p.userId.toString() !== userId);

    if (meeting.participants.length === 0) {
      meeting.status = 'ended';
      meeting.endedAt = new Date();
    }

    return meeting.save();
  }

  async toggleAudio(meetingId: string, userId: string, isOn: boolean): Promise<void> {
    await this.meetingModel.updateOne(
      { _id: meetingId, 'participants.userId': new Types.ObjectId(userId) },
      { $set: { 'participants.$.isAudioOn': isOn } },
    );
  }

  async toggleVideo(meetingId: string, userId: string, isOn: boolean): Promise<void> {
    await this.meetingModel.updateOne(
      { _id: meetingId, 'participants.userId': new Types.ObjectId(userId) },
      { $set: { 'participants.$.isVideoOn': isOn } },
    );
  }

  async end(meetingId: string, userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(meetingId)) {
      throw new NotFoundException('Invalid Meeting ID');
    }

    const meeting = await this.meetingModel.findById(meetingId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Only createdBy or WORKSPACE_ADMIN can end
    // Simplified check:
    if (meeting.createdBy.toString() !== userId) {
      // In a real scenario, check for workspace admin
      throw new ForbiddenException('Only the creator can end the meeting');
    }

    meeting.status = 'ended';
    meeting.endedAt = new Date();
    await meeting.save();
  }

  async findActive(channelId: string): Promise<MeetingDocument | null> {
    if (!Types.ObjectId.isValid(channelId)) {
      return null;
    }
    return this.meetingModel
      .findOne({
        channelId: new Types.ObjectId(channelId),
        status: { $in: ['waiting', 'active'] },
      })
      .exec();
  }
}
