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
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { TaskQueryController } from './controllers/task-query.controller';
import { TaskDetailController } from './controllers/task-detail.controller';
import { TaskCommandController } from './controllers/task-command.controller';
import { TaskWorkflowController } from './controllers/task-workflow.controller';
import { TaskDependencyController } from './controllers/task-dependency.controller';
import { TaskMapper } from './mappers/task.mapper';
import { TaskMovePolicy } from './policies/task-move.policy';
import { TaskReorderPolicy } from './policies/task-reorder.policy';
import { TasksRepository } from './repositories/tasks.repository';
import { TaskReadRepository } from './repositories/task-read.repository';
import { TaskWriteRepository } from './repositories/task-write.repository';
import { TaskRankRepository } from './repositories/task-rank.repository';
import { TaskQueryBuilder } from './repositories/task-query.builder';
import { TaskCounter, TaskCounterSchema } from './schemas/task-counter.schema';
import { Task, TaskSchema } from './schemas/task.schema';
import {
  TaskDependency,
  TaskDependencySchema,
} from './schemas/task-dependency.schema';
import { TaskDependencyService } from './services/task-dependency.service';
import { TaskCounterService } from './services/task-counter.service';
import { TaskCreationValidationService } from './services/task-creation-validation.service';
import { TaskDataTransformerService } from './services/task-data-transformer.service';
import { TaskDomainEventPublisher } from './services/task-domain-event.publisher';
import { TaskKeyService } from './services/task-key.service';
import { TaskDetailService } from './services/task-detail.service';
import { TaskMoveService } from './services/task-move.service';
import { TaskNormalizerService } from './services/task-normalizer.service';
import { TaskReorderService } from './services/task-reorder.service';
import { TaskSearchService } from './services/task-search.service';
import { TasksService } from './services/tasks.service';
import { TaskAccessService } from './services/task-access.service';
import { TaskAssignmentNotificationService } from './services/task-assignment-notification.service';
import { TaskCreateService } from './services/task-create.service';
import { TaskQueryService } from './services/task-query.service';
import { TaskUpdateService } from './services/task-update.service';
import { TaskLifecycleService } from './services/task-lifecycle.service';
import { TaskAuditService } from './shared/task-audit.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: TaskCounter.name, schema: TaskCounterSchema },
      { name: TaskDependency.name, schema: TaskDependencySchema },
    ]),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => ScrumModule),
    forwardRef(() => KanbanModule),
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
    RealtimeModule,
    forwardRef(() => NotificationsModule),
    TaskActivitiesModule,
    AuditModule,
  ],
  controllers: [
    TaskQueryController,
    TaskDetailController,
    TaskCommandController,
    TaskWorkflowController,
    TaskDependencyController,
  ],
  providers: [
    TasksRepository,
    TaskReadRepository,
    TaskWriteRepository,
    TaskRankRepository,
    TaskQueryBuilder,
    TaskMapper,
    TaskKeyService,
    TaskCounterService,
    TaskDetailService,
    TaskCreationValidationService,
    TaskMovePolicy,
    TaskMoveService,
    TaskReorderPolicy,
    TaskReorderService,
    TaskSearchService,
    TaskNormalizerService,
    TaskDataTransformerService,
    TaskDomainEventPublisher,
    TasksService,
    TaskDependencyService,
    TaskAccessService,
    TaskAssignmentNotificationService,
    TaskCreateService,
    TaskQueryService,
    TaskUpdateService,
    TaskLifecycleService,
    TaskAuditService,
    WorkspaceRoleGuard,
  ],
  exports: [TasksService],
})
export class TasksModule {}
