import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

function validateBootEnv(): void {
  const required: Record<string, { minLength: number; description: string }> = {
    JWT_SECRET: { minLength: 32, description: 'JWT signing secret' },
    MEDICAL_DATA_ENCRYPTION_KEY: { minLength: 64, description: 'AES-256 key (hex)' },
    DATABASE_URL: { minLength: 10, description: 'PostgreSQL connection' },
  };
  for (const [key, { minLength, description }] of Object.entries(required)) {
    const val = process.env[key];
    if (!val || val.length < minLength) {
      console.error(`FATAL: ${key} missing or too short. Required: ${description}`);
      process.exit(1);
    }
  }
  const jwtSecret = process.env.JWT_SECRET as string;
  if (jwtSecret === 'secret' || jwtSecret === 'changeme' || jwtSecret === 'development') {
    console.error('FATAL: JWT_SECRET is using a default/insecure value');
    process.exit(1);
  }
}

async function bootstrap() {
  validateBootEnv();

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'https://res.cloudinary.com', 'data:'],
          scriptSrc: ["'self'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true },
    }),
  );

  // Response compression — gzip/brotli for all responses
  app.use(compression());

  // CORS — allow specific origins; mobile apps send no origin so they always pass
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [
        'http://localhost:3000',
        'http://localhost:19006',
        'https://pawmatehub.com',
        'https://pawmateegypt.com',
        'https://pawmatehub-web.netlify.app',
        'https://command-centr.netlify.app',
      ];

  app.enableCors({
    origin: (origin, callback) => {
      // No origin = mobile app, Postman, server-to-server — always allow
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // API versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Global validation pipe — strips unknown fields, transforms types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter — unified error format
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global interceptors
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // Swagger API docs (dev + staging only)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('PawMateHub API')
      .setDescription('Pet care marketplace for Egypt — complete API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication & OTP')
      .addTag('users', 'User profiles & settings')
      .addTag('sitters', 'Sitter profiles & availability')
      .addTag('pets', 'Pet profiles & care schedules')
      .addTag('search', 'Discovery & search')
      .addTag('bookings', 'Booking lifecycle')
      .addTag('tracking', 'GPS walk tracking')
      .addTag('payments', 'Payments & payouts')
      .addTag('reviews', 'Rating & review system')
      .addTag('chat', 'Messaging')
      .addTag('social', 'Community feed')
      .addTag('places', 'Pet-friendly places')
      .addTag('notifications', 'Push & in-app notifications')
      .addTag('admin', 'Admin operations')
      .addTag('support', 'Web platform contact & support')
      .addTag('investor', 'Investor portal — metrics & documents')
      .addTag('web-application', 'Multi-step provider application drafts')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    console.log(`Swagger docs available at: http://localhost:${process.env.PORT || 3000}/api/docs`);
  }

  // Health endpoint served by HealthController at GET /api/v1/health

  // Graceful shutdown — allow in-flight requests to finish before stopping
  app.enableShutdownHooks();

  const logger = new Logger('Bootstrap');
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`PawMate API running on port ${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Handle OS signals for graceful shutdown (Railway sends SIGTERM)
  const shutdown = async (signal: string) => {
    logger.warn(`Received ${signal} — shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
