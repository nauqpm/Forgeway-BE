import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sprint, SprintSchema } from './schemas/sprint.schema';
import { ScrumController } from './controllers/scrum.controller';
import { ScrumService } from './services/scrum.service';
import { AuthModule } from '../auth/auth.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { KanbanModule } from '../kanban/kanban.module';
import { Board, BoardSchema } from '../kanban/schemas/kanban-board.schema';
import { Workspace, WorkspaceSchema } from '../workspaces/schemas/workspace.schema';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';

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
  providers: [ScrumService, WorkspaceRoleGuard],
  exports: [ScrumService],
})
export class ScrumModule {}
