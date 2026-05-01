import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

const ADMIN_ROLES: string[] = [
  UserRole.admin,
  UserRole.owner,
  UserRole.owner_restricted,
];

/**
 * AdminGuard — gates routes to admin / owner / owner_restricted users.
 *
 * Identity contract: relies on JwtAuthGuard having already populated
 * `request.user = { id, email, roles, activeRole }` from the JWT payload.
 * Roles come from the JWT — they are signed and trusted, so no DB hit
 * is required.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const sessionUser = request.user;

    if (!sessionUser?.id) {
      throw new ForbiddenException('Access denied.');
    }

    const roles: string[] = sessionUser.roles ?? [];
    const isAdmin = roles.some((role) => ADMIN_ROLES.includes(role));

    if (!isAdmin) {
      throw new ForbiddenException('Admin access required.');
    }

    return true;
  }
}
