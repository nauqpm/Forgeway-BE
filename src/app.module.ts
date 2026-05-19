import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
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
import { BoardsModule } from './modules/boards/boards.module';
import { SprintsModule } from './modules/sprints/sprints.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { CommentsModule } from './modules/comments/comments.module';
import { SpacesModule } from './modules/spaces/spaces.module';
import { PagesModule } from './modules/pages/pages.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SearchModule } from './modules/search/search.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';

// Real Estate / Blog Modules
import { UtilitiesModule } from './modules/utilities/utilities.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { ImagesModule } from './modules/images/images.module';
import { VerifyModule } from './modules/verify/verify.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
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
            ttl: cfg.get<number>('THROTTLE_DEFAULT_TTL_MS') ?? 60_000,
            limit: cfg.get<number>('THROTTLE_DEFAULT_LIMIT') ?? 120,
          },
        ],
      }),
    }),

    MulterModule.register({
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),

    CommonModule,
    DatabaseModule,

    // Core Auth
    AuthModule,
    UsersModule,
    PermissionsModule,

    // Jira Modules
    WorkspacesModule,
    TasksModule,
    BoardsModule,
    SprintsModule,
    WorkflowsModule,
    CommentsModule,
    AttachmentsModule,

    // Confluence Modules
    SpacesModule,
    PagesModule,

    // System
    NotificationsModule,
    SearchModule,
    DashboardModule,

    // Real Estate / Blog Modules
    UtilitiesModule,
    AddressesModule,
    ImagesModule,

    // Email
    MailerModule.forRoot({
      transport: {
        host: process.env.MAIL_HOST,
        port: parseInt(process.env.MAIL_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASSWORD,
        },
        tls: {
          rejectUnauthorized: false,
        },
      },
      defaults: {
        from: `"AL-TASK" <${process.env.MAIL_USER}>`,
      },
      template: {
        // Use workspace absolute path so templates resolve in both ts-node(dev) + dist(prod)
        dir: join(process.cwd(), 'src', 'modules', 'verify', 'templates'),
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
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
