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

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Image.name, schema: ImageSchema }]),
    MulterModule.register({
      storage: memoryStorage(),
    }),
    forwardRef(() => AuthModule),
    CloudinaryModule,
  ],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    JwtAuthGuard,
  ],
  exports: [ImagesService, JwtAuthGuard],
})
export class ImagesModule {}
