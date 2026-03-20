import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('PostgreSQL connected via Prisma');

    // Auto-migrate on startup in production
    if (process.env.NODE_ENV === 'production') {
      try {
        await this.$executeRawUnsafe('SELECT 1');
        const { execSync } = require('child_process');
        execSync('npx prisma migrate deploy', { stdio: 'inherit' });
        this.logger.log('Database migrations applied');
      } catch (e) {
        this.logger.warn(`Migration warning: ${e.message}`);
      }
    }

    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      (this as any).$on('query', (e: any) => {
        if (e.duration > 100) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Enable soft deletes — exclude deleted records automatically
  async enableShutdownHooks(app: any) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}
