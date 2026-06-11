import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { TaskActivitiesModule } from '../task-activities/task-activities.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { TaskCoverController } from './controllers/task-cover.controller';
import { TaskCoverMapper } from './mappers/task-cover.mapper';
import { TaskCoverPolicy } from './policies/task-cover.policy';
import { TaskCoverRepository } from './repositories/task-cover.repository';
import { TaskCoverService } from './services/task-cover.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
    forwardRef(() => AuthModule),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => TaskActivitiesModule),
  ],
  controllers: [TaskCoverController],
  providers: [
    TaskCoverRepository,
    TaskCoverMapper,
    TaskCoverPolicy,
    TaskCoverService,
  ],
  exports: [TaskCoverService],
})
export class TaskCoversModule {}
