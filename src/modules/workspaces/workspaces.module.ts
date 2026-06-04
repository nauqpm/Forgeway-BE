import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkspacesController } from './controllers/workspaces.controller';
import { ForYouController } from './controllers/for-you.controller';
import { WorkspacesService } from './services/workspaces.service';
import { ForYouService } from './services/for-you.service';
import { WorkspacesRepository } from './repositories/workspaces.repository';
import { Workspace, WorkspaceSchema } from './schemas/workspace.schema';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { UsersModule } from '../users/users.module';
import { KanbanModule } from '../kanban/kanban.module';
import { ScrumModule } from '../scrum/scrum.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Invite, InviteSchema } from './schemas/invite.schema';
import { InviteRepository } from './repositories/invite.repository';
import { InviteService } from './services/invite.service';
import { WorkspaceKeyService } from './services/workspace-key.service';
import { WorkspaceMemberService } from './services/workspace-member.service';
import { InviteController } from './controllers/invite.controller';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: Invite.name, schema: InviteSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => ChatModule),
    forwardRef(() => WorkflowsModule),
    forwardRef(() => UsersModule),
    forwardRef(() => KanbanModule),
    forwardRef(() => ScrumModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [WorkspacesController, ForYouController, InviteController],
  providers: [
    WorkspacesRepository,
    WorkspacesService,
    WorkspaceKeyService,
    WorkspaceMemberService,
    ForYouService,
    InviteRepository,
    InviteService,
    WorkspaceRoleGuard,
  ],
  exports: [WorkspacesService, WorkspaceMemberService, ForYouService, InviteService],
})
export class WorkspacesModule { }
