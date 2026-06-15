import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Page, PageSchema } from './schemas/page.schema';
import { PageDraft, PageDraftSchema } from './schemas/page-draft.schema';
import { PageVersion, PageVersionSchema } from './schemas/page-version.schema';
import { PagesController } from './controllers/pages.controller';
import { PagesService } from './services/pages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';
import {
  Workspace,
  WorkspaceSchema,
} from '../workspaces/schemas/workspace.schema';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Page.name, schema: PageSchema },
      { name: PageDraft.name, schema: PageDraftSchema },
      { name: PageVersion.name, schema: PageVersionSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => RealtimeModule),
  ],
  controllers: [PagesController],
  providers: [PagesService, JwtAuthGuard, WorkspaceRoleGuard],
  exports: [PagesService, JwtAuthGuard, MongooseModule],
})
export class PagesModule {}
