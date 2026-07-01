import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';

import { SECURITY_EVENT_TYPES } from '../constants/audit.constants';
import { SecurityEventDocument } from '../schemas/security-event.schema';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  const create = jest.fn().mockResolvedValue(undefined);
  const model = { create } as unknown as Model<SecurityEventDocument>;
  let service: AuditLogService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuditLogService(model);
  });

  it.each([
    ['INFO', 'log'],
    ['WARN', 'warn'],
    ['CRITICAL', 'error'],
  ] as const)(
    'persists and prints an %s event exactly once',
    (severity, loggerMethod) => {
      const loggerSpy = jest
        .spyOn(Logger.prototype, loggerMethod)
        .mockImplementation(() => undefined);

      service.log({
        type: SECURITY_EVENT_TYPES.LOGIN_FAILED,
        severity,
        userId: 'user-1',
        ip: '127.0.0.1',
        metadata: { reason: 'test' },
      });

      expect(create).toHaveBeenCalledTimes(1);
      expect(loggerSpy).toHaveBeenCalledTimes(1);
      expect(loggerSpy).toHaveBeenCalledWith(
        JSON.stringify({
          category: 'SECURITY',
          event: SECURITY_EVENT_TYPES.LOGIN_FAILED,
          severity,
          userId: 'user-1',
          ip: '127.0.0.1',
          meta: { reason: 'test' },
        }),
      );
    },
  );

  it('enriches and persists a request event exactly once', () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    service.logRequest(
      {
        headers: {
          'x-forwarded-for': '203.0.113.10, 10.0.0.1',
          'user-agent': 'audit-test-agent',
        },
        socket: { remoteAddress: '127.0.0.1' },
      } as never,
      {
        type: SECURITY_EVENT_TYPES.REFRESH_FAILED,
        severity: 'WARN',
        metadata: { reason: 'Refresh token missing' },
      },
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SECURITY_EVENT_TYPES.REFRESH_FAILED,
        ip: '203.0.113.10',
        userAgent: 'audit-test-agent',
      }),
    );
  });
});
