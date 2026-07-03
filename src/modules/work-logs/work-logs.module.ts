import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkLog, WorkLogSchema } from './schemas/work-log.schema';
import { WorkLogsController } from './controllers/work-logs.controller';
import { WorkLogsService } from './services/work-logs.service';
import { WorkLogsRepository } from './repositories/work-logs.repository';
import { WorkLogMapper } from './mappers/work-log.mapper';
import { TasksModule } from '../tasks/tasks.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { TaskActivitiesModule } from '../task-activities/task-activities.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkLog.name, schema: WorkLogSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    forwardRef(() => TasksModule),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => AuthModule),
    TaskActivitiesModule,
  ],
  controllers: [WorkLogsController],
  providers: [WorkLogsService, WorkLogsRepository, WorkLogMapper],
  exports: [WorkLogsService],
})
export class WorkLogsModule {}
