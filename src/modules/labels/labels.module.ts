import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { TaskActivitiesModule } from '../task-activities/task-activities.module';
import { TaskMapper } from '../tasks/mappers/task.mapper';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { LabelsController } from './controllers/labels.controller';
import { TaskLabelsController } from './controllers/task-labels.controller';
import { LabelMapper } from './mappers/label.mapper';
import { Label, LabelSchema } from './schemas/label.schema';
import { LabelService } from './services/label.service';
import { TaskLabelService } from './services/task-label.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Label.name, schema: LabelSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => TaskActivitiesModule),
  ],
  controllers: [LabelsController, TaskLabelsController],
  providers: [LabelService, TaskLabelService, LabelMapper, TaskMapper],
  exports: [LabelService, TaskLabelService],
})
export class LabelsModule {}
