import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

import type {
  SecurityEventSeverityLiteral,
  SecurityEventTypeLiteral,
} from '../constants/audit.constants';

export type SecurityEventDocument = SecurityEvent & Document;
export type SecurityEventType = SecurityEventTypeLiteral;
export type SecurityEventSeverity = SecurityEventSeverityLiteral;

@Schema({ timestamps: true, collection: 'security_events' })
export class SecurityEvent {
  @Prop({ type: String, required: true, index: true })
  type!: SecurityEventType;

  @Prop({ type: String, enum: ['INFO', 'WARN', 'CRITICAL'], required: true })
  severity!: SecurityEventSeverity;

  @Prop({ type: String, index: true })
  userId?: string;

  @Prop({ type: String })
  email?: string;

  @Prop({ type: String, index: true })
  ip?: string;

  @Prop({ type: String })
  userAgent?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({
    type: Date,
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    expires: 0,
  })
  expiresAt!: Date;

  readonly createdAt!: Date;
}

export const SecurityEventSchema = SchemaFactory.createForClass(SecurityEvent);

SecurityEventSchema.index({ userId: 1, type: 1, createdAt: -1 });
SecurityEventSchema.index({ severity: 1, createdAt: -1 });
SecurityEventSchema.index({ ip: 1, createdAt: -1 });
