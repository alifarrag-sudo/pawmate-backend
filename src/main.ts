import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
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

  // CORS — allow mobile app and web clients
  app.enableCors({
    origin: true, // Mobile apps don't have an "origin" — always allow
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
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
      .setTitle('PawMate Egypt API')
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
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    console.log(`📚 Swagger docs available at: http://localhost:${process.env.PORT || 3000}/api/docs`);
  }

  // Simple health endpoint (before global prefix so it's at /health)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api/health', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', version: 'v13-stable', timestamp: new Date().toISOString() });
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 PawMate API running on port ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap();
