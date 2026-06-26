import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { memoryStorage } from 'multer';
import { join } from 'path';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { CommonModule } from './common/common.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

// Jira + Confluence Modules
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { KanbanModule } from './modules/kanban/kanban.module';
import { ScrumModule } from './modules/scrum/scrum.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { CommentsModule } from './modules/comments/comments.module';
import { PagesModule } from './modules/pages/pages.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SearchModule } from './modules/search/search.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { LabelsModule } from './modules/labels/labels.module';
import { TaskCoversModule } from './modules/task-covers/task-covers.module';
import { DocumentsModule } from './modules/documents/documents.module';

// Real Estate / Blog Modules
import { ImagesModule } from './modules/images/images.module';
import { CloudinaryModule } from './modules/cloudinary/cloudinary.module';
import { VerifyModule } from './modules/verify/verify.module';
import { validateEnv } from './config/env.validation';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';
import { CacheModule } from './modules/cache/cache.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RedisModule } from './infra/redis/redis.module';
import { ChatModule } from './modules/chat/chat.module';

const mailPort = Number.parseInt(process.env.MAIL_PORT ?? '587', 10);
const mailSecure = mailPort === 465;
const mailRejectUnauthorized =
  process.env.NODE_ENV === 'production' &&
  process.env.MAIL_TLS_INSECURE !== 'true';

function parseNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),

    EventEmitterModule.forRoot({
      ignoreErrors: true,
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),

    // Default rate limiting applies to every endpoint unless a route explicitly opts out.
    // Sensitive auth endpoints override this with tighter method-level @Throttle settings.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: parseNonNegativeInteger(
              cfg.get('THROTTLE_DEFAULT_TTL_MS'),
              60_000,
            ),
            limit: parseNonNegativeInteger(
              cfg.get('THROTTLE_DEFAULT_LIMIT'),
              120,
            ),
          },
        ],
      }),
    }),

    MulterModule.register({
      storage: memoryStorage(),
    }),

    CommonModule,
    CacheModule,
    RedisModule,
    DatabaseModule,
    RealtimeModule,
    ChatModule,

    // Core Auth
    AuthModule,
    UsersModule,
    PermissionsModule,

    // Jira Modules
    WorkspacesModule,
    TasksModule,
    KanbanModule,
    ScrumModule,
    WorkflowsModule,
    CommentsModule,
    AttachmentsModule,
    LabelsModule,
    TaskCoversModule,
    DocumentsModule,

    // Confluence Modules
    PagesModule,

    // System
    NotificationsModule,
    SearchModule,
    DashboardModule,

    // Real Estate / Blog Modules
    ImagesModule,
    CloudinaryModule,

    // Email
    MailerModule.forRoot({
      transport: {
        host: process.env.MAIL_HOST ?? '',
        port: mailPort,
        secure: mailSecure,
        auth: {
          user: process.env.MAIL_USER ?? '',
          pass: process.env.MAIL_PASSWORD ?? '',
        },
        tls: {
          rejectUnauthorized: mailRejectUnauthorized,
        },
      },
      defaults: {
        from: `"AL-TASK" <${process.env.MAIL_USER ?? ''}>`,
      },
      template: {
        dir: join(
          process.cwd(),
          process.env.NODE_ENV === 'production' ? 'dist' : 'src',
          'modules',
          'verify',
          'templates',
        ),
        adapter: new HandlebarsAdapter(),
        options: {
          strict: true,
        },
      },
    }),

    VerifyModule,
  ],
  providers: [
    // Throttler guard applied globally — individual routes override via @Throttle/@SkipThrottle
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    AppService,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
