import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { AuthModule } from '../auth/auth.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';
import {
  RawRequirement,
  RawRequirementSchema,
} from './schemas/raw-requirement.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RawRequirement.name, schema: RawRequirementSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => WorkspacesModule),
  ],
  controllers: [RequirementsController],
  providers: [RequirementsService, WorkspaceRoleGuard],
  exports: [RequirementsService],
})
export class RequirementsModule {}
