import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Board, BoardSchema } from './schemas/kanban-board.schema';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { KanbanController } from './controllers/kanban.controller';
import { KanbanService } from './services/kanban.service';
import { AuthModule } from '../auth/auth.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import {
  Workspace,
  WorkspaceSchema,
} from '../workspaces/schemas/workspace.schema';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Board.name, schema: BoardSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
    ]),
    RealtimeModule,
    forwardRef(() => AuthModule),
    forwardRef(() => WorkspacesModule),
  ],
  controllers: [KanbanController],
  providers: [KanbanService, WorkspaceRoleGuard],
  exports: [KanbanService],
})
export class KanbanModule {}
