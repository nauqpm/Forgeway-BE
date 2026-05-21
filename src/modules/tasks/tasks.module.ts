import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { KanbanModule } from '../kanban/kanban.module';
import { ScrumModule } from '../scrum/scrum.module';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { TasksController } from './controllers/tasks.controller';
import { TaskMapper } from './mappers/task.mapper';
import { TasksRepository } from './repositories/tasks.repository';
import { Task, TaskSchema } from './schemas/task.schema';
import { TaskKeyService } from './services/task-key.service';
import { TasksService } from './services/tasks.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => ScrumModule),
    forwardRef(() => KanbanModule),
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [TasksController],
  providers: [
    TasksRepository,
    TaskMapper,
    TaskKeyService,
    TasksService,
  ],
  exports: [
    TasksService,
    TaskKeyService,
    TasksRepository,
    TaskMapper,
  ],
})
export class TasksModule {}
