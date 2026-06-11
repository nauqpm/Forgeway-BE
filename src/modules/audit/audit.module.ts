import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  SecurityEvent,
  SecurityEventSchema,
} from './schemas/security-event.schema';
import { AuditLogService } from './services/audit-log.service';
import { AuditController } from './controllers/audit.controller';
import { GuardsModule } from '../auth/guards/guards.module';
import { TokenModule } from '../auth/token.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SecurityEvent.name, schema: SecurityEventSchema },
    ]),
    forwardRef(() => GuardsModule),
    forwardRef(() => TokenModule),
  ],
  controllers: [AuditController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
