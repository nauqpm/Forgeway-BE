import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Image, ImageSchema } from './schemas/image.schema';
import { ImagesService } from './services/images.service';
import { ImagesController } from './controllers/images.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { Page, PageSchema } from '../pages/schemas/page.schema';
import { Channel, ChannelSchema } from '../chat/schemas/channel.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Image.name, schema: ImageSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Page.name, schema: PageSchema },
      { name: Channel.name, schema: ChannelSchema },
    ]),
    MulterModule.register({
      storage: memoryStorage(),
    }),
    forwardRef(() => AuthModule),
    forwardRef(() => WorkspacesModule),
    CloudinaryModule,
  ],
  controllers: [ImagesController],
  providers: [ImagesService, JwtAuthGuard],
  exports: [ImagesService, JwtAuthGuard],
})
export class ImagesModule {}
