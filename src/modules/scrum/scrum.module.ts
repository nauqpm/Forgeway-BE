import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Board, BoardSchema } from '../kanban/schemas/kanban-board.schema';
import { KanbanModule } from '../kanban/kanban.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { AuthModule } from '../auth/auth.module';
import { Workspace, WorkspaceSchema } from '../workspaces/schemas/workspace.schema';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ScrumController } from './controllers/scrum.controller';
import { Sprint, SprintSchema } from './schemas/sprint.schema';
import {
  BacklogService,
  BoardStatusService,
  MongoTransactionService,
  ScrumService,
  SprintCommandService,
  SprintLifecycleService,
  SprintQueryService,
  SprintTaskMovementService,
} from './services';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sprint.name, schema: SprintSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Board.name, schema: BoardSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => KanbanModule),
  ],
  controllers: [ScrumController],
  providers: [
    ScrumService,
    SprintCommandService,
    SprintQueryService,
    SprintLifecycleService,
    SprintTaskMovementService,
    BacklogService,
    BoardStatusService,
    MongoTransactionService,
    WorkspaceRoleGuard,
  ],
  exports: [ScrumService],
})
export class ScrumModule {}
