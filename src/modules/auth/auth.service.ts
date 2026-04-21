import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  NotImplementedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { generateOTP, generateSecureToken, hashValue } from '../../common/utils/crypto.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialLoginDto } from './dto/social-login.dto';

const SALT_ROUNDS = 12;
const EMAIL_CODE_TTL = 600;       // 10 minutes
const RESET_TOKEN_TTL = 3600;     // 1 hour
const VERIFY_TOKEN_TTL = 3600;    // 1 hour
const OTP_MAX_ATTEMPTS = 3;
const OTP_RATE_LIMIT_SECONDS = 3600;
const OTP_RATE_LIMIT_MAX = 5;

const VALID_APP_ROLES = [
  'PARENT', 'PETFRIEND', 'TRAINER', 'KENNEL',
  'PETHOTEL', 'SHOP_OWNER', 'VET', 'GROOMER',
];

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

// ─── Helpers ────────────────────────────────────────────────────────────────

function rolesFromLegacy(role?: string): string[] {
  if (!role) return ['PARENT'];
  const r = role.toLowerCase();
  if (r === 'sitter' || r === 'petfriend') return ['PETFRIEND'];
  if (r === 'both') return ['PARENT', 'PETFRIEND'];
  if (r === 'trainer') return ['TRAINER'];
  if (r === 'kennel') return ['KENNEL'];
  if (r === 'pethotel') return ['PETHOTEL'];
  if (r === 'shop') return ['SHOP_OWNER'];
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
    createdAt: user.createdAt,
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
    private mailService: MailService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ─── Register ─────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

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
        activeRole: (roles[0]?.toLowerCase() ?? 'parent') as any,
        language: dto.language || 'en',
        emailVerified: false,
      },
    });

    // Send email verification
    this.sendEmailVerificationToken(user).catch((err) =>
      this.logger.warn(`Failed to send verification email to ${email}: ${err.message}`),
    );

    // Send welcome email
    this.mailService.sendWelcome(user).catch(() => {});

    this.eventEmitter.emit('user.signed_up', { user, provider: 'email' });

    const tokens = await this.generateTokenPair(user);
    return { ...tokens, user: formatUser(user) };
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

    this.eventEmitter.emit('user.logged_in', { userId: user.id, method: 'email' });

    const tokens = await this.generateTokenPair(user, ipAddress, userAgent);
    return { ...tokens, user: formatUser(user) };
  }

  // ─── Social Login (Google + Facebook) ────────────────────────────────────

  async socialLogin(dto: SocialLoginDto) {
    let providerEmail: string | undefined = dto.email;
    let providerName: string | undefined = dto.name;
    let providerId: string | undefined;
    let emailIsVerified = false;

    if (dto.provider === 'google') {
      const googleClientId = this.configService.get('GOOGLE_CLIENT_ID_WEB');
      if (!googleClientId) {
        throw new NotImplementedException({
          error: 'NOT_CONFIGURED',
          message: 'Google social auth not yet configured.',
        });
      }

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
          const res2 = await fetch('https://www.googleapis.com/userinfo/v2/me', {
            headers: { Authorization: `Bearer ${dto.token}` },
          });
          if (res2.ok) {
            const info: any = await res2.json();
            providerEmail = info.email || providerEmail;
            providerName = info.name || providerName;
            providerId = info.id;
            emailIsVerified = true;
          }
        }
      } catch (err) {
        this.logger.warn(`Google token verify error: ${err}`);
      }
    } else if (dto.provider === 'facebook') {
      const fbAppId = this.configService.get('FACEBOOK_APP_ID');
      if (!fbAppId) {
        throw new NotImplementedException({
          error: 'NOT_CONFIGURED',
          message: 'Facebook social auth not yet configured.',
        });
      }

      try {
        const res = await fetch(
          `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${dto.token}`,
        );
        if (res.ok) {
          const info: any = await res.json();
          providerEmail = info.email || providerEmail;
          providerName = info.name || providerName;
          providerId = info.id;
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

    // Find by provider ID first, then by email
    let user = providerId
      ? await this.prisma.user.findFirst({
          where: { authProviderId: providerId, authProvider: dto.provider },
        })
      : null;

    if (!user) {
      user = await this.prisma.user.findUnique({ where: { email } });
    }

    let isNewUser = false;

    if (user) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          authProviderId: providerId ?? user.authProviderId,
          emailVerified: emailIsVerified || user.emailVerified,
          emailVerifiedAt: emailIsVerified && !user.emailVerified ? new Date() : undefined,
          lastLoginAt: new Date(),
        } as any,
      });

      this.eventEmitter.emit('user.logged_in', { userId: user.id, method: dto.provider });
    } else {
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
          emailVerifiedAt: emailIsVerified ? new Date() : undefined,
          language: 'en',
        } as any,
      });

      isNewUser = true;
      this.eventEmitter.emit('user.signed_up', { user, provider: dto.provider });
    }

    const tokens = await this.generateTokenPair(user);
    return { ...tokens, user: formatUser(user), isNewUser };
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
      const token = generateSecureToken(32);
      await this.redis.setex(`forgot:${token}`, RESET_TOKEN_TTL, user.id);

      this.eventEmitter.emit('user.password_reset_requested', { userId: user.id });

      // Send email
      this.mailService.sendPasswordReset(user, token).catch(() => {});

      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(`[DEV] Password reset token for ${normalizedEmail}: ${token}`);
        return { message: 'If that email is registered, a reset link has been sent.', devToken: token };
      }
    }

    return { message: 'If that email is registered, a reset link has been sent.' };
  }

  // ─── Reset Password ────────────────────────────────────────────────────────

  async resetPassword(token: string, newPassword: string) {
    if (!PASSWORD_REGEX.test(newPassword)) {
      throw new BadRequestException({
        error: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters with at least 1 uppercase letter and 1 number.',
      });
    }

    const userId = await this.redis.get(`forgot:${token}`);
    if (!userId) {
      throw new BadRequestException({
        error: 'TOKEN_INVALID',
        message: 'Invalid or expired reset token.',
      });
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await this.redis.del(`forgot:${token}`);
    await this.revokeAllUserTokens(userId);

    this.eventEmitter.emit('user.password_reset_completed', { userId });

    return { message: 'Password reset successfully. Please sign in with your new password.' };
  }

  // Legacy: code-based reset (kept for backward compat with mobile app)
  async resetPasswordWithCode(email: string, code: string, newPassword: string) {
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

    if (!PASSWORD_REGEX.test(newPassword)) {
      throw new BadRequestException({
        error: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters with at least 1 uppercase letter and 1 number.',
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

    this.eventEmitter.emit('user.password_reset_completed', { userId: user.id });

    return { message: 'Password reset successfully. Please sign in with your new password.' };
  }

  // ─── Email Verification ────────────────────────────────────────────────────

  async sendEmailVerificationToken(user: { id: string; email: string; firstName: string }) {
    const token = generateSecureToken(32);
    await this.redis.setex(`verify:${token}`, VERIFY_TOKEN_TTL, user.id);

    this.mailService.sendEmailVerification(user, token).catch(() => {});

    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`[DEV] Email verify token for ${user.email}: ${token}`);
      return { message: 'Verification link sent to your email.', devToken: token };
    }

    return { message: 'Verification link sent to your email.' };
  }

  async verifyEmailByToken(token: string) {
    const userId = await this.redis.get(`verify:${token}`);
    if (!userId) {
      throw new BadRequestException({
        error: 'TOKEN_INVALID',
        message: 'Invalid or expired verification token.',
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, emailVerifiedAt: new Date() } as any,
    });

    await this.redis.del(`verify:${token}`);

    this.eventEmitter.emit('user.email_verified', { userId });

    return { message: 'Email verified successfully.' };
  }

  // Legacy: code-based email verification (kept for mobile app)
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
      data: { emailVerified: true, emailVerifiedAt: new Date() } as any,
    });

    this.eventEmitter.emit('user.email_verified', { userId });

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
    await this.redis.setex(`sms:${userId}`, 300, hashValue(code));

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
    if (!VALID_APP_ROLES.includes(roleToAdd)) {
      throw new BadRequestException({
        error: 'INVALID_ROLE',
        message: `Invalid role. Valid roles: ${VALID_APP_ROLES.join(', ')}`,
      });
    }

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

    this.eventEmitter.emit('user.role_added', { userId, role: roleToAdd, roles: updatedRoles });

    return { message: `Role ${roleToAdd} added.`, roles: updatedRoles };
  }

  // ─── Get My Roles ──────────────────────────────────────────────────────────

  async getMyRoles(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { roles: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const roles: string[] = (user as any).roles ?? ['PARENT'];
    return { roles, primaryRole: roles[0] || 'PARENT' };
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

    if (!PASSWORD_REGEX.test(newPassword)) {
      throw new BadRequestException({
        error: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters with at least 1 uppercase letter and 1 number.',
      });
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
