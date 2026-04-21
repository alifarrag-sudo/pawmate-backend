import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../services/redis.service';

const ADMIN_ROLES = ['admin', 'owner', 'owner_restricted'];
const CACHE_TTL_SECONDS = 60;

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub;

    if (!userId) {
      throw new ForbiddenException('Access denied.');
    }

    // Check Redis cache first
    const cacheKey = `user:role:${userId}`;
    const cachedRole = await this.redis.get(cacheKey);

    if (cachedRole) {
      if (!ADMIN_ROLES.includes(cachedRole)) {
        throw new ForbiddenException('Admin access required.');
      }
      return true;
    }

    // Cache miss — query DB
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      throw new ForbiddenException('Access denied.');
    }

    // Cache the role for 60s
    await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, user.role);

    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Admin access required.');
    }

    return true;
  }
}
