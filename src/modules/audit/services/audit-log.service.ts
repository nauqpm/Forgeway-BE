import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Request } from 'express';
import { Model, Types } from 'mongoose';

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

export interface AuditQueryOptions {
  userId?: string;
  type?: string;
  severity?: string;
  ip?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface AuditLogResult {
  data: SecurityEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

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
      this.logger.error(
        `[AuditLog] Failed to persist event: ${err.message}`,
        err.stack,
      );
    });

    const structuredLog = {
      category: 'SECURITY',
      event: payload.type,
      severity: payload.severity,
      userId: payload.userId,
      ip: payload.ip,
      ...(payload.metadata ? { meta: payload.metadata } : {}),
    };
    const message = JSON.stringify(structuredLog);

    if (payload.severity === 'CRITICAL') {
      this.logger.error(message);
    } else if (payload.severity === 'WARN') {
      this.logger.warn(message);
    } else {
      this.logger.log(message);
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

  async queryLogs(options: AuditQueryOptions = {}): Promise<AuditLogResult> {
    const {
      userId,
      type,
      severity,
      ip,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = options;

    const filter: Record<string, unknown> = {};

    if (userId) {
      filter.userId = userId;
    }
    if (type) {
      filter.type = type;
    }
    if (severity) {
      filter.severity = severity;
    }
    if (ip) {
      filter.ip = ip;
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate)
        (filter.createdAt as Record<string, Date>).$gte = startDate;
      if (endDate) (filter.createdAt as Record<string, Date>).$lte = endDate;
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.securityEventModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.securityEventModel.countDocuments(filter).exec(),
    ]);

    return {
      data: data.map(doc => ({
        ...doc,
        _id: doc._id,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getLogById(id: string): Promise<SecurityEventDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.securityEventModel.findById(id).exec();
  }

  async getStats(): Promise<{
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    recentCount: number;
  }> {
    const [total, bySeverity, byType, recentCount] = await Promise.all([
      this.securityEventModel.countDocuments().exec(),
      this.securityEventModel.aggregate([
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]),
      this.securityEventModel.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      this.securityEventModel
        .countDocuments({
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        })
        .exec(),
    ]);

    const severityMap: Record<string, number> = {};
    for (const item of bySeverity) {
      severityMap[item._id] = item.count;
    }

    const typeMap: Record<string, number> = {};
    for (const item of byType) {
      typeMap[item._id] = item.count;
    }

    return { total, bySeverity: severityMap, byType: typeMap, recentCount };
  }
}
