import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { GLOBAL_ROLES, GlobalRole } from '../constants/global-role.constants';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<GlobalRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      throw new ForbiddenException('Role metadata is required for this route');
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: string } | undefined;

    if (!user?.role) {
      throw new ForbiddenException('Insufficient role');
    }

    if (user.role === GLOBAL_ROLES.SUPER_ADMIN) {
      return true;
    }

    if (!requiredRoles.includes(user.role as GlobalRole)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
