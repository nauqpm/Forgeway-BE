import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Auth, AuthSchema } from '../modules/auth/schemas/auth.schema';
import { RolesGuard } from './guards/roles.guard';
import { WorkspaceRoleGuard } from './guards/workspace-role.guard';
import { PermissionsModule } from '../modules/permissions/permissions.module';
import { AuthModule } from '../modules/auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Auth.name, schema: AuthSchema }]),
    forwardRef(() => PermissionsModule),
    forwardRef(() => AuthModule),
  ],
  providers: [RolesGuard, WorkspaceRoleGuard],
  exports: [MongooseModule, RolesGuard, WorkspaceRoleGuard],
})
export class CommonModule {}
