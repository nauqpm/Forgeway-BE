// src/modules/auth/services/audit-log.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import {
  SecurityEvent,
  SecurityEventDocument,
  SecurityEventType,
  SecurityEventSeverity,
} from '../schemas/security-event.schema';

export interface AuditLogPayload {
  type: SecurityEventType;
  severity: SecurityEventSeverity;
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  /** Metadata bổ sung — KHÔNG bao gồm token/password/OTP/secret */
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

  /**
   * Ghi security event — fire-and-forget, không block request.
   * KHÔNG bao giờ truyền token, password, OTP vào metadata.
   */
  log(payload: AuditLogPayload): void {
    const record = {
      ...payload,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    };

    // Persist to MongoDB — async, không chặn request
    this.securityEventModel.create(record).catch((err: Error) => {
      this.logger.error(`[AuditLog] Failed to persist event: ${err.message}`, err.stack);
    });

    // Emit to NestJS logger — SIEM/log-aggregator sẽ đọc stdout
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

  /**
   * Extract client IP — hỗ trợ reverse proxy (X-Forwarded-For).
   * Lấy IP đầu tiên trong chuỗi (original client), không trust toàn bộ header.
   */
  static extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      // Lấy IP đầu tiên (client thực), loại bỏ proxy IPs
      return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress ?? 'unknown';
  }

  /**
   * Extract User-Agent — truncate để tránh log quá lớn.
   */
  static extractUserAgent(req: Request): string {
    const ua = req.headers['user-agent'] ?? 'unknown';
    return ua.substring(0, 200); // Truncate
  }
}
