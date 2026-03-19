import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const tls = this.config.get('REDIS_TLS') === 'true';
    this.client = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get('REDIS_PASSWORD'),
      tls: tls ? {} : undefined,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<string | null> {
    if (mode === 'NX' && ttl) {
      return this.client.set(key, value, 'EX', ttl, 'NX');
    }
    return this.client.set(key, value);
  }

  async setex(key: string, ttl: number, value: string): Promise<string> {
    return this.client.setex(key, ttl, value);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttl: number): Promise<number> {
    return this.client.expire(key, ttl);
  }

  async hset(key: string, data: Record<string, string>): Promise<number> {
    return this.client.hset(key, data);
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    return this.client.hgetall(key);
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.client.zadd(key, score, member);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrevrange(key, start, stop);
  }

  async pipeline() {
    return this.client.pipeline();
  }

  getClient(): Redis {
    return this.client;
  }
}
