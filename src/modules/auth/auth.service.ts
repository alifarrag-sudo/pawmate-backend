import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { generateOTP, generateSecureToken, hashValue } from '../../common/utils/crypto.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

const SALT_ROUNDS = 12;
const OTP_TTL_SECONDS = 600; // 10 minutes
const OTP_MAX_ATTEMPTS = 3;
const OTP_RATE_LIMIT_SECONDS = 3600; // 1 hour window
const OTP_RATE_LIMIT_MAX = 5; // max OTPs per phone per hour

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redis: RedisService,
    private notifications: NotificationsService,
  ) {}

  async register(dto: RegisterDto) {
    // Check duplicate phone
    const existingPhone = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existingPhone) {
      // If already registered but not verified, resend OTP so they can complete registration
      if (!existingPhone.phoneVerified) {
        const otp = generateOTP(6);
        const otpHash = hashValue(otp);
        await this.redis.setex(`otp:${dto.phone}`, OTP_TTL_SECONDS, otpHash);
        if (this.configService.get('NODE_ENV') === 'development') {
          this.logger.debug(`[DEV] OTP for ${dto.phone}: ${otp}`);
          return { userId: existingPhone.id, message: `OTP resent to ${dto.phone}`, devOtp: otp };
        }
        await this.notifications.sendSms(dto.phone, `Your PawMate verification code is: ${otp}. Valid for 10 minutes.`);
        return { userId: existingPhone.id, message: `OTP resent to ${dto.phone}` };
      }
      throw new ConflictException({ error: 'PHONE_EXISTS', message: 'This phone number is already registered. Please login instead.' });
    }

    // Check duplicate email if provided
    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existingEmail) {
        throw new ConflictException({ error: 'EMAIL_EXISTS', message: 'This email is already registered.' });
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        isOwner: dto.role === 'owner' || dto.role === 'both',
        isSitter: dto.role === 'sitter' || dto.role === 'both',
        activeRole: dto.role === 'sitter' ? 'sitter' : 'owner',
        language: dto.language || 'ar',
      },
    });

    // Send OTP
    const otp = generateOTP(6);
    const otpHash = hashValue(otp);
    await this.redis.setex(`otp:${dto.phone}`, OTP_TTL_SECONDS, otpHash);

    // In development, skip SMS and return OTP directly
    if (this.configService.get('NODE_ENV') === 'development') {
      this.logger.debug(`[DEV] OTP for ${dto.phone}: ${otp}`);
      return {
        userId: user.id,
        message: `OTP sent to ${dto.phone}`,
        devOtp: otp,
      };
    }

    await this.notifications.sendSms(
      dto.phone,
      `Your PawMate verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`,
    );

    return {
      userId: user.id,
      message: `OTP sent to ${dto.phone}`,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const attemptsKey = `otp:attempts:${dto.phone}`;
    const otpKey = `otp:${dto.phone}`;

    // Check attempts
    const attempts = await this.redis.get(attemptsKey);
    if (attempts && parseInt(attempts) >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException({
        error: 'OTP_MAX_ATTEMPTS',
        message: 'Too many OTP attempts. Please request a new OTP.',
      });
    }

    // Get stored OTP hash
    const storedOtpHash = await this.redis.get(otpKey);
    if (!storedOtpHash) {
      throw new BadRequestException({
        error: 'OTP_EXPIRED',
        message: 'OTP has expired. Please request a new one.',
      });
    }

    // Verify OTP
    const inputHash = hashValue(dto.otp);
    if (inputHash !== storedOtpHash) {
      // Increment attempts
      await this.redis.incr(attemptsKey);
      await this.redis.expire(attemptsKey, OTP_TTL_SECONDS);
      throw new BadRequestException({
        error: 'OTP_INVALID',
        message: 'Invalid OTP. Please try again.',
      });
    }

    // OTP valid — clean up
    await this.redis.del(otpKey);
    await this.redis.del(attemptsKey);

    // Mark phone as verified
    const user = await this.prisma.user.update({
      where: { phone: dto.phone },
      data: { phoneVerified: true },
    });

    // Issue tokens
    return this.generateTokenPair(user);
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    // Find user by phone
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException({ error: 'INVALID_CREDENTIALS', message: 'Invalid phone or password.' });
    }

    // Check if banned
    if (user.isBanned) {
      throw new UnauthorizedException({
        error: 'ACCOUNT_BANNED',
        message: `Account suspended. Reason: ${user.banReason || 'Policy violation'}`,
      });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      // Track failed login attempts (for anomaly detection)
      await this.trackFailedLogin(user.id, ipAddress);
      throw new UnauthorizedException({ error: 'INVALID_CREDENTIALS', message: 'Invalid phone or password.' });
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.generateTokenPair(user, ipAddress, userAgent);
  }

  async refreshToken(token: string) {
    // Verify the refresh token
    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({ error: 'TOKEN_INVALID', message: 'Invalid or expired refresh token.' });
    }

    // Check if token is revoked
    const tokenHash = hashValue(token);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, isRevoked: false },
    });

    if (!stored) {
      // COMPROMISE DETECTION: old token used — revoke entire family
      await this.revokeAllUserTokens(payload.sub);
      throw new UnauthorizedException({
        error: 'TOKEN_REVOKED',
        message: 'This session has been terminated for security. Please log in again.',
      });
    }

    if (new Date() > stored.expiresAt) {
      throw new UnauthorizedException({ error: 'TOKEN_EXPIRED', message: 'Session expired. Please log in again.' });
    }

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    // Get user
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.isBanned) {
      throw new UnauthorizedException({ error: 'ACCOUNT_INACTIVE', message: 'Account is not active.' });
    }

    // Issue new token pair
    return this.generateTokenPair(user, stored.ipAddress || undefined, stored.userAgent || undefined);
  }

  async logout(refreshToken: string) {
    const tokenHash = hashValue(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { isRevoked: true },
    });
    return { message: 'Logged out successfully.' };
  }

  async sendOtp(phone: string) {
    // Rate limit: max 5 OTPs per phone per hour
    const rateLimitKey = `otp:ratelimit:${phone}`;
    const count = await this.redis.incr(rateLimitKey);
    if (count === 1) {
      await this.redis.expire(rateLimitKey, OTP_RATE_LIMIT_SECONDS);
    }
    if (count > OTP_RATE_LIMIT_MAX) {
      throw new BadRequestException({
        error: 'OTP_RATE_LIMIT',
        message: 'Too many OTP requests. Please wait before requesting another.',
      });
    }

    // Generate and store OTP (hashed)
    const otp = generateOTP(6);
    const otpHash = hashValue(otp);
    await this.redis.setex(`otp:${phone}`, OTP_TTL_SECONDS, otpHash);

    // Send via SMS
    await this.notifications.sendSms(
      phone,
      `Your PawMate verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`,
    );

    this.logger.log(`OTP sent to ${phone}`);

    // In development, log the OTP for testing
    if (this.configService.get('NODE_ENV') === 'development') {
      this.logger.debug(`[DEV] OTP for ${phone}: ${otp}`);
    }

    return { message: 'OTP sent successfully.' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException({ error: 'WRONG_PASSWORD', message: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Revoke all existing refresh tokens (security: force re-login on all devices)
    await this.revokeAllUserTokens(userId);

    return { message: 'Password changed successfully. Please log in again.' };
  }

  private async generateTokenPair(user: any, ipAddress?: string, userAgent?: string) {
    const payload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
      activeRole: user.activeRole,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '30d'),
      },
    );

    // Store refresh token hash
    const tokenHash = hashValue(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Enforce max 5 active refresh tokens per user
    const activeTokens = await this.prisma.refreshToken.count({
      where: { userId: user.id, isRevoked: false },
    });
    if (activeTokens >= 5) {
      // Revoke oldest token
      const oldest = await this.prisma.refreshToken.findFirst({
        where: { userId: user.id, isRevoked: false },
        orderBy: { createdAt: 'asc' },
      });
      if (oldest) {
        await this.prisma.refreshToken.update({
          where: { id: oldest.id },
          data: { isRevoked: true },
        });
      }
    }

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        profilePhoto: user.profilePhoto,
        phone: user.phone,
        email: user.email,
        activeRole: user.activeRole,
        isOwner: user.isOwner,
        isSitter: user.isSitter,
        idVerified: user.idVerified,
        loyaltyTier: user.loyaltyTier,
        loyaltyPoints: user.loyaltyPoints,
        language: user.language,
        role: user.role,
      },
    };
  }

  private async revokeAllUserTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  private async trackFailedLogin(userId: string, ipAddress?: string) {
    const key = `failed_login:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600); // 1 hour window

    if (count >= 10) {
      // Lock account and alert admin
      this.logger.warn(`Account ${userId} locked: 10+ failed logins from ${ipAddress}`);
      // TODO: notify admin via notification service
    }
  }
}
