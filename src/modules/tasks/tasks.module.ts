import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ScrumModule } from '../scrum/scrum.module';
import { KanbanModule } from '../kanban/kanban.module';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { TaskAttachmentsController } from './controllers/task-attachments.controller';
import { TaskItemsController } from './controllers/task-items.controller';
import { TaskLabelsController } from './controllers/task-labels.controller';
import {
  KanbanBoardTasksController,
  SprintTasksController,
  UserTasksController,
} from './controllers/task-scope-queries.controller';
import { TasksController } from './controllers/tasks.controller';
import { TaskMapper } from './mappers/task.mapper';
import { TasksRepository } from './repositories/tasks.repository';
import { Task, TaskSchema } from './schemas/task.schema';
import { TaskAssignmentService } from './services/task-assignment.service';
import { TaskKeyService } from './services/task-key.service';
import { TasksFacadeService } from './services/tasks-facade.service';
import { TaskMovementService } from './services/task-movement.service';
import { TaskStatusService } from './services/task-status.service';
import { TasksService } from './services/tasks.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => ScrumModule),
    forwardRef(() => KanbanModule),
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [
    TasksController,
    TaskItemsController,
    SprintTasksController,
    KanbanBoardTasksController,
    UserTasksController,
    TaskLabelsController,
    TaskAttachmentsController,
  ],
  providers: [
    TasksRepository,
    TaskMapper,
    TaskKeyService,
    TasksFacadeService,
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
    TasksFacadeService,
    TaskKeyService,
    TasksRepository,
    TaskMapper,
  ],
})
export class TasksModule {}
