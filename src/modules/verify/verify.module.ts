import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Verify, VerifySchema } from './schemas/verify.schema';
import { VerifyService } from './services/verify.service';
import { VerifyController } from './controllers/verify.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Verify.name, schema: VerifySchema }]),
  ],
  controllers: [VerifyController],
  providers: [VerifyService],
  exports: [VerifyService],
})
export class VerifyModule {}
