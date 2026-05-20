import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkspacesController } from './controllers/workspaces.controller';
import { ForYouController } from './controllers/for-you.controller';
import { WorkspacesService } from './services/workspaces.service';
import { ForYouService } from './services/for-you.service';
import { WorkspacesRepository } from './repositories/workspaces.repository';
import { Workspace, WorkspaceSchema } from './schemas/workspace.schema';
import { AuthModule } from '../auth/auth.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { UsersModule } from '../users/users.module';
import { Invite, InviteSchema } from './schemas/invite.schema';
import { InviteRepository } from './repositories/invite.repository';
import { InviteService } from './services/invite.service';
import { InviteController } from './controllers/invite.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: Invite.name, schema: InviteSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => WorkflowsModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [WorkspacesController, ForYouController, InviteController],
  providers: [WorkspacesRepository, WorkspacesService, ForYouService, InviteRepository, InviteService],
  exports: [WorkspacesService, ForYouService, InviteService],
})
export class WorkspacesModule {}
