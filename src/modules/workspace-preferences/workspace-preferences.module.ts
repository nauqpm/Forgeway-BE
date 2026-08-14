import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Workspace,
  WorkspaceSchema,
} from '../workspaces/schemas/workspace.schema';
import { AuthModule } from '../auth/auth.module';
import { WorkspacePreferencesController } from './controllers/workspace-preferences.controller';
import {
  WorkspacePreference,
  WorkspacePreferenceSchema,
} from './schemas/workspace-preference.schema';
import { WorkspacePreferencesService } from './services/workspace-preferences.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    MongooseModule.forFeature([
      { name: WorkspacePreference.name, schema: WorkspacePreferenceSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
    ]),
  ],
  controllers: [WorkspacePreferencesController],
  providers: [WorkspacePreferencesService],
  exports: [WorkspacePreferencesService],
})
export class WorkspacePreferencesModule {}
