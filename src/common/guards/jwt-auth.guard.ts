import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../services/redis.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Let Passport validate JWT — sets request.user to the JWT payload
    const result = await (super.canActivate(context) as Promise<boolean>);
    if (!result) return false;

    const request = context.switchToHttp().getRequest();
    const jwtPayload = request.user;
    if (!jwtPayload?.sub) return false;

    // FIX 4: Check Redis cache first (avoid DB hit on every request)
    const cacheKey = `user:active:${jwtPayload.sub}`;
    const cached = await this.redis.get(cacheKey);

    if (cached === 'banned') {
      throw new ForbiddenException({ error: 'ACCOUNT_BANNED', message: 'Account suspended.' });
    }
    if (cached === 'deleted') {
      throw new UnauthorizedException({ error: 'ACCOUNT_DELETED', message: 'Account no longer exists.' });
    }

    if (!cached) {
      // Cache miss — check database
      const user = await this.prisma.user.findUnique({
        where: { id: jwtPayload.sub },
        select: {
          id: true,
          role: true,
          isBanned: true,
          banReason: true,
          deletedAt: true,
          isActive: true,
        },
      });

      if (!user || user.deletedAt || !user.isActive) {
        await this.redis.setex(cacheKey, 60, 'deleted');
        throw new UnauthorizedException({ error: 'ACCOUNT_DELETED', message: 'Account no longer exists.' });
      }

      if (user.isBanned) {
        await this.redis.setex(cacheKey, 60, 'banned');
        throw new ForbiddenException({
          error: 'ACCOUNT_BANNED',
          message: `Your account has been suspended. Reason: ${user.banReason || 'Policy violation'}`,
        });
      }

      // Cache active status for 60 seconds
      await this.redis.setex(cacheKey, 60, 'active');
    }

    return true;
  }

  // Keep handleRequest synchronous — only handles JWT validation errors
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          error: 'TOKEN_EXPIRED',
          message: 'Access token has expired. Please refresh.',
        });
      }
      if (info?.name === 'JsonWebTokenError') {
        throw new UnauthorizedException({
          error: 'TOKEN_INVALID',
          message: 'Invalid access token.',
        });
      }
      throw err || new UnauthorizedException({ error: 'UNAUTHORIZED', message: 'Authentication required.' });
    }
    return user;
  }
}
