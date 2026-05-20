import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { BoardsModule } from '../boards/boards.module';
import { SprintsModule } from '../sprints/sprints.module';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { TaskAttachmentsController } from './controllers/task-attachments.controller';
import { TaskLabelsController } from './controllers/task-labels.controller';
import { TasksController } from './controllers/tasks.controller';
import { TaskMapper } from './mappers/task.mapper';
import { TasksRepository } from './repositories/tasks.repository';
import { Task, TaskSchema } from './schemas/task.schema';
import { TaskAssignmentService } from './services/task-assignment.service';
import { TaskMovementService } from './services/task-movement.service';
import { TaskStatusService } from './services/task-status.service';
import { TasksService } from './services/tasks.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => SprintsModule),
    forwardRef(() => BoardsModule),
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [
    TasksController,
    TaskLabelsController,
    TaskAttachmentsController,
  ],
  providers: [
    TasksRepository,
    TaskMapper,
    TasksService,
    TaskAssignmentService,
    TaskStatusService,
    TaskMovementService,
  ],
  exports: [
    TasksService,
    TaskAssignmentService,
    TaskStatusService,
    TaskMovementService,
    TasksRepository,
    TaskMapper,
  ],
})
export class TasksModule {}
