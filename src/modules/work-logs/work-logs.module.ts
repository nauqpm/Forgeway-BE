import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkLog, WorkLogSchema } from './schemas/work-log.schema';
import { WorkLogsController } from './controllers/work-logs.controller';
import { WorkLogsService } from './services/work-logs.service';
import { WorkLogsQueryService } from './services/work-logs-query.service';
import { WorkLogsRepository } from './repositories/work-logs.repository';
import { WorkLogMapper } from './mappers/work-log.mapper';
import { TasksModule } from '../tasks/tasks.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { TaskActivitiesModule } from '../task-activities/task-activities.module';
import { AuthModule } from '../auth/auth.module';

import {
  Workspace,
  WorkspaceSchema,
} from '../workspaces/schemas/workspace.schema';

import { WorkLogReportsController } from './controllers/work-log-reports.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkLog.name, schema: WorkLogSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
    ]),
    forwardRef(() => TasksModule),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => AuthModule),
    TaskActivitiesModule,
  ],
  controllers: [WorkLogsController, WorkLogReportsController],
  providers: [
    WorkLogsService,
    WorkLogsQueryService,
    WorkLogsRepository,
    WorkLogMapper,
  ],
  exports: [WorkLogsService, WorkLogsQueryService],
})
export class WorkLogsModule {}
