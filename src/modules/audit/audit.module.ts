import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { SecurityEvent, SecurityEventSchema } from './schemas/security-event.schema';
import { AuditLogService } from './services/audit-log.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SecurityEvent.name, schema: SecurityEventSchema }]),
  ],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
