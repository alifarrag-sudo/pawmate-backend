import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { UploadsService } from '../uploads/uploads.service';

// VERSION_NEUTRAL: Railway health check hits /api/health (no version prefix)
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly uploads: UploadsService,
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
        cloudinary: {
          configured: this.uploads.cloudinaryReady,
        },
        paymob_payout: {
          configured:
            !!process.env.PAYMOB_PAYOUT_API_KEY &&
            !!process.env.PAYMOB_PAYOUT_MERCHANT_ID,
        },
      },
      version: process.env.npm_package_version || '1.0.0',
    };
  }
}
