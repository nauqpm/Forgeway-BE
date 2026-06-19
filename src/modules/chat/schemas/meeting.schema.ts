import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MeetingDocument = Meeting & Document;
export type MeetingType = 'voice' | 'video';

@Schema()
export class MeetingParticipant {
  @Prop({ type: Types.ObjectId, ref: 'User' }) userId!: Types.ObjectId;
  @Prop({ default: () => new Date() }) joinedAt!: Date;
  @Prop({ default: true }) isAudioOn!: boolean;
  @Prop({ default: false }) isVideoOn!: boolean;
  @Prop({ default: false }) isMuted!: boolean;
}

@Schema({ timestamps: true })
export class Meeting {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true, index: true })
  channelId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Workspace', default: null })
  workspaceId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['waiting', 'active', 'ended'],
    default: 'waiting',
  })
  status!: string;

  @Prop({
    type: String,
    enum: ['voice', 'video'],
    default: 'video',
    index: true,
  })
  type!: MeetingType;

  @Prop({
    type: [SchemaFactory.createForClass(MeetingParticipant)],
    default: [],
  })
  participants!: MeetingParticipant[];

  @Prop({ type: String, default: null })
  routerId?: string;

  @Prop({ type: String, unique: true, sparse: true })
  roomName?: string;

  @Prop({ type: Date, default: null }) startedAt?: Date;
  @Prop({ type: Date, default: null }) endedAt?: Date;

  readonly _id!: Types.ObjectId;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);

MeetingSchema.index({ channelId: 1, status: 1 });
