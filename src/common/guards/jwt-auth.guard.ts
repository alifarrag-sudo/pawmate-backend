import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SANDBOX_PUBLIC_KEY } from '../decorators/sandbox-public.decorator';
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

    // @SandboxPublic — sandbox builds skip JWT for marked routes so
    // friends-and-family flows can bootstrap a session without an
    // existing token. Production deployments (SANDBOX_MODE unset or
    // false) ignore the decorator and enforce JWT as usual.
    const isSandboxPublic = this.reflector.getAllAndOverride<boolean>(
      SANDBOX_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isSandboxPublic && process.env.SANDBOX_MODE === 'true') {
      return true;
    }

    // Let Passport validate JWT — JwtStrategy.validate sets request.user to
    // the session shape: { id, email, roles, activeRole }.
    const result = await (super.canActivate(context) as Promise<boolean>);
    if (!result) return false;

    const request = context.switchToHttp().getRequest();
    const sessionUser = request.user;
    if (!sessionUser?.id) return false;

    // Status checks (banned / deleted / inactive) — Redis-cached per user.
    const cacheKey = `user:active:${sessionUser.id}`;
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
        where: { id: sessionUser.id },
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
