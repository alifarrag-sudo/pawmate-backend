import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    return super.canActivate(context);
  }

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

    // Check if user is banned
    if (user.isBanned) {
      throw new UnauthorizedException({
        error: 'ACCOUNT_BANNED',
        message: `Your account has been suspended. Reason: ${user.banReason || 'Policy violation'}`,
      });
    }

    return user;
  }
}
