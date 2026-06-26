import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { TaskActivitiesModule } from '../task-activities/task-activities.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { TaskAttachmentController } from './controllers/task-attachment.controller';
import { AttachmentsController } from './controllers/attachments.controller';
import { AttachmentMapper } from './mappers/attachment.mapper';
import { Attachment, AttachmentSchema } from './schemas/attachment.schema';
import { AttachmentService } from './services/attachment.service';
import { TaskAttachmentService } from './services/task-attachment.service';
import { ImagesModule } from '../images/images.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Attachment.name, schema: AttachmentSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    forwardRef(() => AuthModule),
    AuditModule,
    forwardRef(() => WorkspacesModule),
    forwardRef(() => TaskActivitiesModule),
    ImagesModule,
  ],
  controllers: [TaskAttachmentController, AttachmentsController],
  providers: [AttachmentService, TaskAttachmentService, AttachmentMapper],
  exports: [AttachmentService, TaskAttachmentService],
})
export class AttachmentsModule {}
