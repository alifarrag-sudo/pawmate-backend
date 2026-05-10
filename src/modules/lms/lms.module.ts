import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { LmsController } from './lms.controller';
import { LmsService } from './lms.service';
import { CertificateService } from './certificate.service';

@Module({
  imports: [
    PrismaModule,
    UploadsModule,
    EventEmitterModule,
    // Use the auth JWT secret so the same key validates the LMS web-link
    // token. Key rotation (G2 work) flips both atomically.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [LmsController],
  providers: [LmsService, CertificateService],
  exports: [LmsService],
})
export class LmsModule {}
