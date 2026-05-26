import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Page, PageSchema } from './schemas/page.schema';
import { PagesController } from './controllers/pages.controller';
import { PagesService } from './services/pages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';
import { Workspace, WorkspaceSchema } from '../workspaces/schemas/workspace.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Page.name, schema: PageSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [PagesController],
  providers: [PagesService, JwtAuthGuard],
  exports: [PagesService, JwtAuthGuard],
})
export class PagesModule { }
