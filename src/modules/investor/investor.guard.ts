import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Allows access to users with the INVESTOR role or any admin role. */
@Injectable()
export class InvestorGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub;

    if (!userId) {
      throw new ForbiddenException('Access denied.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { roles: true, role: true },
    });

    if (!user) {
      throw new ForbiddenException('Access denied.');
    }

    // Admin roles always pass
    const adminRoles = ['admin', 'owner', 'owner_restricted'];
    if (adminRoles.includes(user.role)) {
      return true;
    }

    // Must have INVESTOR in the roles array
    if (!user.roles.includes('INVESTOR')) {
      throw new ForbiddenException('Investor access required.');
    }

    return true;
  }
}
