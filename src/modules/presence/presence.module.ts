import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisModule } from '../../infra/redis/redis.module';
import { User, UserSchema } from '../users/schemas/users.schema';
import { PresenceConfig } from './presence.config';
import { PresenceService } from './services/presence.service';
import { PresenceStateService } from './services/presence-state.service';
import { PresenceSweeper } from './services/presence-sweeper.service';
import { PresenceQueryService } from './services/presence-query.service';
import { PresenceController } from './presence.controller';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    RedisModule,
    UsersModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [PresenceController],
  providers: [
    PresenceConfig,
    PresenceStateService,
    PresenceService,
    PresenceSweeper,
    PresenceQueryService,
  ],
  exports: [PresenceService, PresenceQueryService, PresenceConfig],
})
export class PresenceModule {}
