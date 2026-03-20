import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private connected = false;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.config.get('REDIS_URL');
    const tls = this.config.get('REDIS_TLS') === 'true';

    const options: any = {
      lazyConnect: true,
      retryStrategy: () => null, // don't retry — fail fast
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    };

    if (!redisUrl) {
      options.host = this.config.get('REDIS_HOST', 'localhost');
      options.port = this.config.get<number>('REDIS_PORT', 6379);
      options.password = this.config.get('REDIS_PASSWORD');
      if (tls) options.tls = {};
    }

    this.client = redisUrl ? new Redis(redisUrl, options) : new Redis(options);
    this.client.on('connect', () => { this.connected = true; this.logger.log('Redis connected'); });
    this.client.on('error', () => { this.connected = false; });

    try {
      await this.client.connect();
      this.connected = true;
    } catch {
      this.logger.warn('Redis unavailable — caching/OTP features disabled');
    }
  }

  async onModuleDestroy() {
    try { await this.client.quit(); } catch {}
  }

  private safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    if (!this.connected) return Promise.resolve(fallback);
    return fn().catch(() => fallback);
  }

  async get(key: string): Promise<string | null> {
    return this.safe(() => this.client.get(key), null);
  }

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<string | null> {
    return this.safe(() => {
      if (mode === 'NX' && ttl) return this.client.set(key, value, 'EX', ttl, 'NX');
      return this.client.set(key, value);
    }, null);
  }

  async setex(key: string, ttl: number, value: string): Promise<string> {
    return this.safe(() => this.client.setex(key, ttl, value), 'OK');
  }

  async del(key: string): Promise<number> {
    return this.safe(() => this.client.del(key), 0);
  }

  async incr(key: string): Promise<number> {
    return this.safe(() => this.client.incr(key), 0);
  }

  async expire(key: string, ttl: number): Promise<number> {
    return this.safe(() => this.client.expire(key, ttl), 0);
  }

  async hset(key: string, data: Record<string, string>): Promise<number> {
    return this.safe(() => this.client.hset(key, data), 0);
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    return this.safe(() => this.client.hgetall(key), null);
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.safe(() => this.client.zadd(key, score, member), 0);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.safe(() => this.client.zrevrange(key, start, stop), []);
  }

  async pipeline() {
    return this.client.pipeline();
  }

  getClient(): Redis {
    return this.client;
  }
}
