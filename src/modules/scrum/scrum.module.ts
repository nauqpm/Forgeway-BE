import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Board, BoardSchema } from '../kanban/schemas/kanban-board.schema';
import { KanbanModule } from '../kanban/kanban.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { AuthModule } from '../auth/auth.module';
import {
  Workspace,
  WorkspaceSchema,
} from '../workspaces/schemas/workspace.schema';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ScrumController } from './controllers/scrum.controller';
import { WorkspaceReportsController } from './controllers/workspace-reports.controller';
import { Sprint, SprintSchema } from './schemas/sprint.schema';
import { BacklogService } from './services/backlog.service';
import { BoardStatusService } from './services/board-status.service';
import { ScrumService } from './services/scrum.service';
import { SprintCommandService } from './services/sprint-command.service';
import { SprintDomainEventPublisher } from './services/sprint-domain-event.publisher';
import { SprintLifecycleService } from './services/sprint-lifecycle.service';
import { SprintQueryService } from './services/sprint-query.service';
import { SprintTaskMovementService } from './services/sprint-task-movement.service';
import {
  TaskActivity,
  TaskActivitySchema,
} from '../task-activities/schemas/task-activity.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sprint.name, schema: SprintSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Board.name, schema: BoardSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: TaskActivity.name, schema: TaskActivitySchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => KanbanModule),
  ],
  controllers: [ScrumController, WorkspaceReportsController],
  providers: [
    ScrumService,
    SprintCommandService,
    SprintDomainEventPublisher,
    SprintQueryService,
    SprintLifecycleService,
    SprintTaskMovementService,
    BacklogService,
    BoardStatusService,
    WorkspaceRoleGuard,
  ],
  exports: [ScrumService],
})
export class ScrumModule {}
