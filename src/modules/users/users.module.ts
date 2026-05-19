// users.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './services/users.service';
import { AdminSeedService } from './services/admin-seed.service';
import { UsersRepository } from './repositories/users.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/users.schema';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { UsersController } from './controllers/users.controller';
import { CommonModule } from '../../common/common.module';
import { Token, TokenSchema } from '../auth/schemas/token.schema';
import { Otp, OtpSchema } from '../auth/schemas/otp.schema';
import { Auth, AuthSchema } from '../auth/schemas/auth.schema';
import { VerifyModule } from '../verify/verify.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Token.name, schema: TokenSchema },
      { name: Otp.name, schema: OtpSchema },
      { name: Auth.name, schema: AuthSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionsModule),
    VerifyModule,
    CommonModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, AdminSeedService],
  exports: [UsersService],
})
export class UsersModule {}
