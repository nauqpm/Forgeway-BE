import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Request } from 'express';
import { Model } from 'mongoose';

import {
  SecurityEvent,
  SecurityEventDocument,
  SecurityEventSeverity,
  SecurityEventType,
} from '../schemas/security-event.schema';

export interface AuditLogPayload {
  type: SecurityEventType;
  severity: SecurityEventSeverity;
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export type RequestAuditLogPayload = Omit<AuditLogPayload, 'ip' | 'userAgent'>;

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectModel(SecurityEvent.name)
    private readonly securityEventModel: Model<SecurityEventDocument>,
  ) {}

  log(payload: AuditLogPayload): void {
    const record = {
      ...payload,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    };

    this.securityEventModel.create(record).catch((err: Error) => {
      this.logger.error(`[AuditLog] Failed to persist event: ${err.message}`, err.stack);
    });

    const structuredLog = {
      event: payload.type,
      severity: payload.severity,
      userId: payload.userId,
      ip: payload.ip,
      ...(payload.metadata ? { meta: payload.metadata } : {}),
    };

    if (payload.severity === 'CRITICAL') {
      this.logger.error(`[SECURITY] ${payload.type}`, JSON.stringify(structuredLog));
    } else if (payload.severity === 'WARN') {
      this.logger.warn(`[SECURITY] ${payload.type}`, JSON.stringify(structuredLog));
    } else {
      this.logger.log(`[SECURITY] ${payload.type}`, JSON.stringify(structuredLog));
    }
  }

  logRequest(req: Request, payload: RequestAuditLogPayload): void {
    this.log({
      ...payload,
      ip: AuditLogService.extractIp(req),
      userAgent: AuditLogService.extractUserAgent(req),
    });
  }

  static extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }

    return req.socket?.remoteAddress ?? 'unknown';
  }

  static extractUserAgent(req: Request): string {
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    return userAgent.substring(0, 200);
  }
}
