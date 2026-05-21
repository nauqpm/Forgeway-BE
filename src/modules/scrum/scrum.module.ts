import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sprint, SprintSchema } from './schemas/sprint.schema';
import { ScrumController } from './controllers/scrum.controller';
import { ScrumService } from './services/scrum.service';
import { AuthModule } from '../auth/auth.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sprint.name, schema: SprintSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [ScrumController],
  providers: [ScrumService],
  exports: [ScrumService],
})
export class ScrumModule {}
