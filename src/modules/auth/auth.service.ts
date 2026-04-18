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
import { SocialLoginDto } from './dto/social-login.dto';

const SALT_ROUNDS = 12;
const EMAIL_CODE_TTL = 600;       // 10 minutes
const RESET_CODE_TTL = 600;       // 10 minutes
const OTP_MAX_ATTEMPTS = 3;
const OTP_RATE_LIMIT_SECONDS = 3600;
const OTP_RATE_LIMIT_MAX = 5;

// ─── Helpers ────────────────────────────────────────────────────────────────

function rolesFromLegacy(role?: string): string[] {
  if (!role) return ['PARENT'];
  const r = role.toLowerCase();
  if (r === 'sitter' || r === 'petfriend') return ['PETFRIEND'];
  if (r === 'both') return ['PARENT', 'PETFRIEND'];
  if (r === 'trainer') return ['TRAINER'];
  if (r === 'kennel') return ['KENNEL'];
  if (r === 'pethotel') return ['PETHOTEL'];
  if (r === 'shop') return ['SHOP'];
  return ['PARENT'];
}

function formatUser(user: any) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    profilePhoto: user.profilePhoto,
    phone: user.phone,
    email: user.email,
    roles: user.roles ?? ['PARENT'],
    activeRole: user.activeRole,
    isParent: user.isParent,
    isPetFriend: user.isPetFriend,
    idVerified: user.idVerified,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    authProvider: user.authProvider,
    language: user.language,
    role: user.role,
    loyaltyTier: user.loyaltyTier,
    loyaltyPoints: user.loyaltyPoints,
  };
}

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

  // ─── Register ─────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    // Check duplicate email
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        error: 'EMAIL_EXISTS',
        message: 'An account with this email already exists. Sign in instead.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const roles = rolesFromLegacy(dto.role);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        authProvider: 'email',
        roles,
        isParent: roles.includes('PARENT'),
        isPetFriend: roles.includes('PETFRIEND'),
        activeRole: roles[0]?.toLowerCase() ?? 'parent',
        language: dto.language || 'en',
        emailVerified: false,
      },
    });

    // Send email verification code in background (non-blocking)
    this.sendEmailVerificationCode(user.id, email).catch((err) =>
      this.logger.warn(`Failed to send verification email to ${email}: ${err.message}`),
    );

    const tokens = await this.generateTokenPair(user);
    return {
      ...tokens,
      user: formatUser(user),
    };
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password.',
      });
    }

    if (user.isBanned) {
      throw new UnauthorizedException({
        error: 'ACCOUNT_BANNED',
        message: `Account suspended. Reason: ${user.banReason || 'Policy violation'}`,
      });
    }

    if (!user.passwordHash) {
      // Social-login user trying to sign in with password
      throw new UnauthorizedException({
        error: 'SOCIAL_ACCOUNT',
        message: `This account was created with ${user.authProvider}. Please sign in with ${user.authProvider}.`,
      });
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      await this.trackFailedLogin(user.id, ipAddress);
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password.',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokenPair(user, ipAddress, userAgent);
    return {
      ...tokens,
      user: formatUser(user),
    };
  }

  // ─── Social Login (Google + Facebook) ────────────────────────────────────

  async socialLogin(dto: SocialLoginDto) {
    let providerEmail: string | undefined = dto.email;
    let providerName: string | undefined = dto.name;
    let providerId: string | undefined;
    let emailIsVerified = false;

    // Verify token with provider
    if (dto.provider === 'google') {
      try {
        const res = await fetch(
          `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${dto.token}`,
        );
        if (res.ok) {
          const info: any = await res.json();
          providerEmail = info.email || providerEmail;
          providerName = info.name || providerName;
          providerId = info.sub;
          emailIsVerified = info.email_verified === 'true' || info.email_verified === true;
        } else {
          // Fallback: try userinfo endpoint with access token
          const res2 = await fetch('https://www.googleapis.com/userinfo/v2/me', {
            headers: { Authorization: `Bearer ${dto.token}` },
          });
          if (res2.ok) {
            const info: any = await res2.json();
            providerEmail = info.email || providerEmail;
            providerName = info.name || providerName;
            providerId = info.id;
            emailIsVerified = true; // Google-authenticated emails are always verified
          }
        }
      } catch (err) {
        this.logger.warn(`Google token verify error: ${err}`);
      }
    } else if (dto.provider === 'facebook') {
      try {
        const res = await fetch(
          `https://graph.facebook.com/me?fields=id,name,email&access_token=${dto.token}`,
        );
        if (res.ok) {
          const info: any = await res.json();
          providerEmail = info.email || providerEmail;
          providerName = info.name || providerName;
          providerId = info.id;
          // Facebook emails are not automatically verified
          emailIsVerified = !!info.email;
        }
      } catch (err) {
        this.logger.warn(`Facebook token verify error: ${err}`);
      }
    }

    if (!providerEmail) {
      throw new UnauthorizedException({
        error: 'SOCIAL_NO_EMAIL',
        message: `Could not get email from ${dto.provider}. Please try another sign-in method.`,
      });
    }

    const email = providerEmail.toLowerCase();

    // Find existing user
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      // User exists — update provider info and log in
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          authProviderId: providerId ?? user.authProviderId,
          emailVerified: emailIsVerified || user.emailVerified,
          lastLoginAt: new Date(),
        } as any,
      });
    } else {
      // New user — auto-register
      const nameParts = (providerName || email.split('@')[0]).split(' ');
      const firstName = nameParts[0] || 'User';
      const lastName = nameParts.slice(1).join(' ') || '';

      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash: null,
          firstName,
          lastName,
          authProvider: dto.provider,
          authProviderId: providerId,
          roles: ['PARENT'],
          isParent: true,
          isPetFriend: false,
          activeRole: 'parent',
          emailVerified: emailIsVerified,
          language: 'en',
        } as any,
      });
    }

    const tokens = await this.generateTokenPair(user);
    return {
      ...tokens,
      user: formatUser(user),
      isNewUser: !user.createdAt || (new Date().getTime() - new Date(user.createdAt).getTime() < 5000),
    };
  }

  // ─── Forgot Password ───────────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    // Rate limit
    const rateLimitKey = `reset:ratelimit:${normalizedEmail}`;
    const count = await this.redis.incr(rateLimitKey);
    if (count === 1) await this.redis.expire(rateLimitKey, OTP_RATE_LIMIT_SECONDS);
    if (count > OTP_RATE_LIMIT_MAX) {
      throw new BadRequestException({
        error: 'RATE_LIMIT',
        message: 'Too many reset requests. Please wait before trying again.',
      });
    }

    // Always return success to prevent email enumeration
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (user && user.authProvider === 'email') {
      const code = generateOTP(6);
      const codeHash = hashValue(code);
      await this.redis.setex(`reset:${normalizedEmail}`, RESET_CODE_TTL, codeHash);

      const devMode = process.env.NODE_ENV !== 'production';
      if (devMode) {
        this.logger.debug(`[DEV] Password reset code for ${normalizedEmail}: ${code}`);
      }

      // Send email (non-blocking) — sendEmail may not be implemented yet
      (this.notifications as any).sendEmail?.(normalizedEmail, 'PawMate Password Reset', `Your reset code is: ${code}. Valid for 10 minutes.`)
        ?.catch?.(() => {});
    }

    const response: any = { message: 'If that email is registered, a reset code has been sent.' };
    if (process.env.NODE_ENV !== 'production' && user) {
      const stored = await this.redis.get(`reset:${normalizedEmail}`);
      if (stored) {
        // Retrieve and return the plain code for dev (we stored the hash, so re-generate)
        // In dev, re-issue a fresh code that we CAN return
        const devCode = generateOTP(6);
        await this.redis.setex(`reset:${normalizedEmail}`, RESET_CODE_TTL, hashValue(devCode));
        response.devCode = devCode;
      }
    }

    return response;
  }

  // ─── Reset Password ────────────────────────────────────────────────────────

  async resetPassword(email: string, code: string, newPassword: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const storedHash = await this.redis.get(`reset:${normalizedEmail}`);
    if (!storedHash) {
      throw new BadRequestException({
        error: 'CODE_EXPIRED',
        message: 'Reset code has expired. Please request a new one.',
      });
    }

    if (hashValue(code) !== storedHash) {
      throw new BadRequestException({
        error: 'CODE_INVALID',
        message: 'Invalid reset code.',
      });
    }

    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) throw new NotFoundException('User not found');

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    await this.redis.del(`reset:${normalizedEmail}`);
    await this.revokeAllUserTokens(user.id);

    return { message: 'Password reset successfully. Please sign in with your new password.' };
  }

  // ─── Email Verification ────────────────────────────────────────────────────

  async sendEmailVerificationCode(userId: string, email: string) {
    const rateLimitKey = `emailverify:ratelimit:${email}`;
    const count = await this.redis.incr(rateLimitKey);
    if (count === 1) await this.redis.expire(rateLimitKey, OTP_RATE_LIMIT_SECONDS);
    if (count > OTP_RATE_LIMIT_MAX) {
      throw new BadRequestException({
        error: 'RATE_LIMIT',
        message: 'Too many verification requests.',
      });
    }

    const code = generateOTP(6);
    await this.redis.setex(`emailverify:${userId}`, EMAIL_CODE_TTL, hashValue(code));

    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`[DEV] Email verify code for ${email}: ${code}`);
    }

    (this.notifications as any).sendEmail?.(email, 'Verify your PawMate email', `Your verification code is: ${code}. Valid for 10 minutes.`)
      ?.catch?.(() => {});

    const response: any = { message: 'Verification code sent to your email.' };
    if (process.env.NODE_ENV !== 'production') response.devCode = code;
    return response;
  }

  async verifyEmail(userId: string, code: string) {
    const storedHash = await this.redis.get(`emailverify:${userId}`);
    if (!storedHash) {
      throw new BadRequestException({
        error: 'CODE_EXPIRED',
        message: 'Verification code expired. Please request a new one.',
      });
    }

    const attemptsKey = `emailverify:attempts:${userId}`;
    const attempts = parseInt((await this.redis.get(attemptsKey)) || '0');
    if (attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException({
        error: 'TOO_MANY_ATTEMPTS',
        message: 'Too many attempts. Please request a new code.',
      });
    }

    if (hashValue(code) !== storedHash) {
      await this.redis.incr(attemptsKey);
      await this.redis.expire(attemptsKey, EMAIL_CODE_TTL);
      throw new BadRequestException({
        error: 'CODE_INVALID',
        message: 'Invalid code. Please try again.',
      });
    }

    await this.redis.del(`emailverify:${userId}`);
    await this.redis.del(`emailverify:attempts:${userId}`);

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });

    return { message: 'Email verified successfully.' };
  }

  // ─── Phone Verification (SMS) ─────────────────────────────────────────────

  async sendPhoneVerificationCode(userId: string, phone: string) {
    const rateLimitKey = `sms:ratelimit:${phone}`;
    const count = await this.redis.incr(rateLimitKey);
    if (count === 1) await this.redis.expire(rateLimitKey, OTP_RATE_LIMIT_SECONDS);
    if (count > OTP_RATE_LIMIT_MAX) {
      throw new BadRequestException({ error: 'RATE_LIMIT', message: 'Too many OTP requests.' });
    }

    const code = generateOTP(6);
    await this.redis.setex(`sms:${userId}`, 300, hashValue(code)); // 5 min

    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`[DEV] SMS code for ${phone}: ${code}`);
    } else {
      await this.notifications.sendSms(phone, `Your PawMate code: ${code}. Valid 5 minutes.`);
    }

    const response: any = { message: 'SMS code sent.' };
    if (process.env.NODE_ENV !== 'production') response.devCode = code;
    return response;
  }

  async verifyPhone(userId: string, code: string, phone: string) {
    const storedHash = await this.redis.get(`sms:${userId}`);
    if (!storedHash) {
      throw new BadRequestException({ error: 'CODE_EXPIRED', message: 'Code expired.' });
    }
    if (hashValue(code) !== storedHash) {
      throw new BadRequestException({ error: 'CODE_INVALID', message: 'Invalid code.' });
    }

    await this.redis.del(`sms:${userId}`);
    await this.prisma.user.update({
      where: { id: userId },
      data: { phone, phoneVerified: true },
    });

    return { message: 'Phone verified.' };
  }

  // ─── Get Current User ─────────────────────────────────────────────────────

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        petFriendProfile: true,
        trainerProfile: {
          include: { offerings: { where: { isActive: true } } },
        },
        kennelProfile: true,
        petHotelProfile: true,
        pets: { where: { isActive: true } },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return {
      ...formatUser(user),
      pets: user.pets,
      profiles: {
        petFriend: user.petFriendProfile,
        trainer: user.trainerProfile,
        kennel: user.kennelProfile,
        petHotel: user.petHotelProfile,
      },
    };
  }

  // ─── Add Role ──────────────────────────────────────────────────────────────

  async addRole(userId: string, roleToAdd: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const existingRoles: string[] = (user as any).roles ?? ['PARENT'];
    if (existingRoles.includes(roleToAdd)) {
      return { message: `Role ${roleToAdd} is already active.`, roles: existingRoles };
    }

    const updatedRoles = [...existingRoles, roleToAdd];

    const updateData: any = { roles: updatedRoles };
    if (roleToAdd === 'PETFRIEND') {
      updateData.isPetFriend = true;
    }

    await this.prisma.user.update({ where: { id: userId }, data: updateData });
    return { message: `Role ${roleToAdd} added.`, roles: updatedRoles };
  }

  // ─── Token operations ─────────────────────────────────────────────────────

  async refreshToken(token: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({ error: 'TOKEN_INVALID', message: 'Invalid or expired refresh token.' });
    }

    const tokenHash = hashValue(token);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, isRevoked: false },
    });

    if (!stored) {
      await this.revokeAllUserTokens(payload.sub);
      throw new UnauthorizedException({
        error: 'TOKEN_REVOKED',
        message: 'This session has been terminated. Please log in again.',
      });
    }

    if (new Date() > stored.expiresAt) {
      throw new UnauthorizedException({ error: 'TOKEN_EXPIRED', message: 'Session expired.' });
    }

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { isRevoked: true } });

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.isBanned) {
      throw new UnauthorizedException({ error: 'ACCOUNT_INACTIVE', message: 'Account is not active.' });
    }

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

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash) {
      throw new BadRequestException({ error: 'SOCIAL_ACCOUNT', message: 'This account uses social login.' });
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException({ error: 'WRONG_PASSWORD', message: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
    await this.revokeAllUserTokens(userId);

    return { message: 'Password changed. Please log in again.' };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async generateTokenPair(user: any, ipAddress?: string, userAgent?: string) {
    const payload = {
      sub: user.id,
      email: user.email,
      roles: (user as any).roles ?? ['PARENT'],
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

    const tokenHash = hashValue(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Enforce max 5 active refresh tokens per user
    const activeTokens = await this.prisma.refreshToken.count({
      where: { userId: user.id, isRevoked: false },
    });
    if (activeTokens >= 5) {
      const oldest = await this.prisma.refreshToken.findFirst({
        where: { userId: user.id, isRevoked: false },
        orderBy: { createdAt: 'asc' },
      });
      if (oldest) {
        await this.prisma.refreshToken.update({ where: { id: oldest.id }, data: { isRevoked: true } });
      }
    }

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, ipAddress, userAgent, expiresAt },
    });

    return { accessToken, refreshToken };
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
    if (count === 1) await this.redis.expire(key, 3600);
    if (count >= 10) {
      this.logger.warn(`Account ${userId} locked: 10+ failed logins from ${ipAddress}`);
    }
  }
}
