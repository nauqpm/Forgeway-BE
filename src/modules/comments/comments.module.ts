import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Page, PageSchema } from '../pages/schemas/page.schema';
import { TaskActivitiesModule } from '../task-activities/task-activities.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { CommentsController } from './controllers/comments.controller';
import { TaskCommentController } from './controllers/task-comment.controller';
import { CommentMapper } from './mappers/comment.mapper';
import { Comment, CommentSchema } from './schemas/comment.schema';
import { CommentService } from './services/comment.service';
import { TaskCommentService } from './services/task-comment.service';
import { TaskCommentNotificationService } from './services/task-comment-notification.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Page.name, schema: PageSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => WorkspacesModule),
    forwardRef(() => TaskActivitiesModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [CommentsController, TaskCommentController],
  providers: [
    CommentService,
    TaskCommentService,
    TaskCommentNotificationService,
    CommentMapper,
  ],
  exports: [CommentService, TaskCommentService],
})
export class CommentsModule {}
