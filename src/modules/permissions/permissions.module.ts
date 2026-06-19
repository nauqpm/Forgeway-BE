import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PermissionsController } from './controllers/permissions.controller';
import { PermissionsService } from './services/permissions.service';
import { Permission, PermissionSchema } from './schemas/permission.schema';
import {
  UserPermission,
  UserPermissionSchema,
} from './schemas/user-permission.schema';
import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthTokenConfigModule } from '../auth/config/auth-token-config.module';
import { AuthTokenConfigService } from '../auth/config/auth-token-config.service';
import { CommonModule } from '../../common/common.module';
import { User, UserSchema } from '../users/schemas/users.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Permission.name, schema: PermissionSchema },
      { name: UserPermission.name, schema: UserPermissionSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => AuthModule),
    CommonModule,
    JwtModule.registerAsync({
      imports: [AuthTokenConfigModule],
      inject: [AuthTokenConfigService],
      useFactory: async (authTokenConfig: AuthTokenConfigService) => ({
        secret: authTokenConfig.jwtSecret,
        signOptions: {
          expiresIn: authTokenConfig.accessTokenTtlSeconds,
        },
      }),
    }),
  ],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService, MongooseModule],
})
export class PermissionsModule {}
