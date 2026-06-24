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
import { Comment, CommentSchema } from '../comments/schemas/comment.schema';
import { Sprint, SprintSchema } from '../scrum/schemas/sprint.schema';
import { User, UserSchema } from '../users/schemas/users.schema';
import { GlobalSearchAuxiliaryService } from './services/global-search-auxiliary.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: Page.name, schema: PageSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Sprint.name, schema: SprintSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [SearchController],
  providers: [SearchService, GlobalSearchAuxiliaryService, JwtAuthGuard],
  exports: [SearchService],
})
export class SearchModule {}
