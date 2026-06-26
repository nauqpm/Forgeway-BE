import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { TaskActivitiesController } from './controllers/task-activities.controller';
import { TaskActivityMapper } from './mappers/task-activity.mapper';
import { TaskActivitiesRepository } from './repositories/task-activities.repository';
import {
  TaskActivity,
  TaskActivitySchema,
} from './schemas/task-activity.schema';
import { TaskActivitiesService } from './services/task-activities.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TaskActivity.name, schema: TaskActivitySchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => AuthModule),
    forwardRef(() => AuditModule),
  ],
  controllers: [TaskActivitiesController],
  providers: [
    TaskActivitiesRepository,
    TaskActivityMapper,
    TaskActivitiesService,
  ],
  exports: [TaskActivitiesService],
})
export class TaskActivitiesModule {}
