import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UtilitiesService } from './services/utilities.service';
import { UtilitiesController } from './controllers/utilities.controller';
import { Amenity, AmenitySchema } from './schemas/amenity.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Amenity.name, schema: AmenitySchema }]),
    forwardRef(() => AuthModule),
  ],
  controllers: [UtilitiesController],
  providers: [UtilitiesService, JwtAuthGuard],
  exports: [JwtAuthGuard, UtilitiesService],
})
export class UtilitiesModule {}
