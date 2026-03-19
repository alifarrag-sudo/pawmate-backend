import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user } = request;
    const userId = user?.id || 'anonymous';
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          const statusCode = context.switchToHttp().getResponse().statusCode;
          this.logger.log(`[${method}] ${url} — ${statusCode} (${duration}ms) [user:${userId}]`);
        },
        error: (error) => {
          const duration = Date.now() - start;
          this.logger.error(`[${method}] ${url} — ERROR (${duration}ms) [user:${userId}]: ${error.message}`);
        },
      }),
    );
  }
}
