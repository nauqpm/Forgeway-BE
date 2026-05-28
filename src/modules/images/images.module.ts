import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Image, ImageSchema } from './schemas/image.schema';
import { ImagesService } from './services/images.service';
import { ImagesController } from './controllers/images.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';
import { STORAGE_PROVIDER, LocalStorageProvider } from './providers';

/**
 * Factory provider — resolves active storage based on STORAGE_PROVIDER env var.
 * Currently only 'local' is implemented. Add cloud providers here.
 */
const storageProviderFactory = {
  provide: STORAGE_PROVIDER,
  useFactory: () => {
    const provider = process.env.STORAGE_PROVIDER || 'local';
    switch (provider) {
      case 'local':
      default:
        return new LocalStorageProvider();
      // Future: case 's3': return new S3StorageProvider();
      // Future: case 'cloudinary': return new CloudinaryStorageProvider();
    }
  },
};

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Image.name, schema: ImageSchema }]),
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
    forwardRef(() => AuthModule),
  ],
  controllers: [ImagesController],
  providers: [ImagesService, JwtAuthGuard, storageProviderFactory],
  exports: [ImagesService, JwtAuthGuard, STORAGE_PROVIDER],
})
export class ImagesModule {}
