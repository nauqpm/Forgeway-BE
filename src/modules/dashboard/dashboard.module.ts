import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DashboardController } from './controllers/dashboard.controller';
import { DashboardService } from './services/dashboard.service';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import {
  Workspace,
  WorkspaceSchema,
} from '../workspaces/schemas/workspace.schema';
import { Sprint, SprintSchema } from '../scrum/schemas/sprint.schema';
import { Page, PageSchema } from '../pages/schemas/page.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: Sprint.name, schema: SprintSchema },
      { name: Page.name, schema: PageSchema },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [DashboardController],
  providers: [DashboardService, JwtAuthGuard],
  exports: [DashboardService],
})
export class DashboardModule {}
