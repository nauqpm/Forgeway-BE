import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { Image, ImageSchema } from './schemas/image.schema';
import { ImagesService } from './services/images.service';
import { ImagesController } from './controllers/images.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryProvider } from './providers/cloudinary.provider';
import { CloudinaryService } from './services/cloudinary.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Image.name, schema: ImageSchema }]),
    MulterModule.register({
      storage: diskStorage({
        destination: (req: any, file, cb) => {
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');

          let moduleType = 'others';
          const url = req.url || '';
          if (url.includes('avatar')) moduleType = 'avatars';
          else if (req.body?.type) moduleType = req.body.type;

          const uploadPath = join('uploads', moduleType, String(year), month, day);
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
    forwardRef(() => AuthModule),
  ],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    JwtAuthGuard,
    CloudinaryProvider,
    CloudinaryService,
  ],
  exports: [ImagesService, JwtAuthGuard, CloudinaryService],
})
export class ImagesModule {}
