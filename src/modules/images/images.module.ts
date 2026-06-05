import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Image, ImageSchema } from './schemas/image.schema';
import { ImagesService } from './services/images.service';
import { ImagesController } from './controllers/images.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryProvider } from './providers/cloudinary.provider';
import { CloudinaryService } from './services/cloudinary.service';

const storage = diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    const originalName = file.originalname.replace(/\.[^/.]+$/, '');
    const safeName = originalName.replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${safeName}-${uniqueSuffix}${ext}`);
  },
});

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Image.name, schema: ImageSchema }]),
    MulterModule.register({
      storage,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
    forwardRef(() => AuthModule),
  ],
  controllers: [ImagesController],
  providers: [ImagesService, JwtAuthGuard, CloudinaryProvider, CloudinaryService],
  exports: [ImagesService, JwtAuthGuard, CloudinaryService],
})
export class ImagesModule {}
