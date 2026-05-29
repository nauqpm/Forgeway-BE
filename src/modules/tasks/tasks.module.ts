import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { KanbanModule } from '../kanban/kanban.module';
import { ScrumModule } from '../scrum/scrum.module';
import { TaskActivitiesModule } from '../task-activities/task-activities.module';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { TasksController } from './controllers/tasks.controller';
import { TaskMapper } from './mappers/task.mapper';
import { TaskMovePolicy } from './policies/task-move.policy';
import { TasksRepository } from './repositories/tasks.repository';
import { TaskCounter, TaskCounterSchema } from './schemas/task-counter.schema';
import { Task, TaskSchema } from './schemas/task.schema';
import { TaskCounterService } from './services/task-counter.service';
import { TaskCreationValidationService } from './services/task-creation-validation.service';
import { TaskDataTransformerService } from './services/task-data-transformer.service';
import { TaskKeyService } from './services/task-key.service';
import { TaskDetailService } from './services/task-detail.service';
import { TaskMoveService } from './services/task-move.service';
import { TaskNormalizerService } from './services/task-normalizer.service';
import { TasksService } from './services/tasks.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: TaskCounter.name, schema: TaskCounterSchema },
    ]),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => ScrumModule),
    forwardRef(() => KanbanModule),
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
    RealtimeModule,
    TaskActivitiesModule,
    AuditModule,
  ],
  controllers: [TasksController],
  providers: [
    TasksRepository,
    TaskMapper,
    TaskKeyService,
    TaskCounterService,
    TaskDetailService,
    TaskCreationValidationService,
    TaskMovePolicy,
    TaskMoveService,
    TaskNormalizerService,
    TaskDataTransformerService,
    TasksService,
    WorkspaceRoleGuard,
  ],
  exports: [
    TasksService,
    TaskDetailService,
    TaskKeyService,
    TaskCounterService,
    TaskCreationValidationService,
    TaskMovePolicy,
    TaskMoveService,
    TaskNormalizerService,
    TaskDataTransformerService,
    TasksRepository,
    TaskMapper,
  ],
})
export class TasksModule {}
