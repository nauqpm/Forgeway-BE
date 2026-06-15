import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchController } from './controllers/search.controller';
import { SearchService } from './services/search.service';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import {
  Workspace,
  WorkspaceSchema,
} from '../workspaces/schemas/workspace.schema';
import { Page, PageSchema } from '../pages/schemas/page.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: Page.name, schema: PageSchema },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [SearchController],
  providers: [SearchService, JwtAuthGuard],
  exports: [SearchService],
})
export class SearchModule {}
