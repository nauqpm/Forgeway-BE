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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workspace.name, schema: WorkspaceSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => WorkflowsModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [WorkspacesController, ForYouController],
  providers: [WorkspacesRepository, WorkspacesService, ForYouService],
  exports: [WorkspacesService, ForYouService],
})
export class WorkspacesModule {}
