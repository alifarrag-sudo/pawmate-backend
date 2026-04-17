import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @Public()
  async check() {
    const checks = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.get('health:ping').then(() => 'pong'),
    ]);

    const db = checks[0].status === 'fulfilled' ? 'ok' : 'error';
    const cache = checks[1].status === 'fulfilled' ? 'ok' : 'error';
    const status = db === 'ok' && cache === 'ok' ? 'ok' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: db,
        cache,
        api: 'ok',
      },
      version: process.env.npm_package_version || '1.0.0',
    };
  }
}
