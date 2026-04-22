import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Public: Registration & Login ─────────────────────────────────────────

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register with email + password (email-first, no OTP gate)' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email + password' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('social')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in / register with Google or Facebook OAuth token' })
  async socialLogin(@Body() dto: SocialLoginDto) {
    return this.authService.socialLogin(dto);
  }

  // ─── Public: Password Reset ────────────────────────────────────────────────

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset link via email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token from email link' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // ─── Public: Email Verification (token-based, from email link) ────────────

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email using token from verification link' })
  async verifyEmailByToken(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmailByToken(dto.token);
  }

  // ─── Public: One-Time Login (for direct-created team members) ─────────────

  @Public()
  @Post('one-time-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in using a one-time login token (sent via email to direct-created team members)' })
  async oneTimeLogin(@Body() body: { token: string }) {
    return this.authService.oneTimeLogin(body.token);
  }

  // ─── Public: Token management ──────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  // ─── Authenticated ─────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user with all role profiles' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (authenticated user)' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  // ─── Authenticated: Code-based email verification (mobile app) ────────────

  @UseGuards(JwtAuthGuard)
  @Post('verify-email-code')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify email with 6-digit code (mobile app)' })
  async verifyEmailCode(@CurrentUser('id') userId: string, @Body() body: { code: string }) {
    return this.authService.verifyEmail(userId, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('send-email-verification')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Re-send email verification code' })
  async sendEmailVerification(@CurrentUser('id') userId: string, @CurrentUser('email') email: string) {
    return this.authService.sendEmailVerificationCode(userId, email);
  }

  // ─── Authenticated: Phone verification ─────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('verify-phone')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify phone number with SMS code' })
  async verifyPhone(
    @CurrentUser('id') userId: string,
    @Body() body: { code: string; phone: string },
  ) {
    return this.authService.verifyPhone(userId, body.code, body.phone);
  }

  @UseGuards(JwtAuthGuard)
  @Post('send-phone-verification')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send SMS verification code to a phone number' })
  async sendPhoneVerification(
    @CurrentUser('id') userId: string,
    @Body() body: { phone: string },
  ) {
    return this.authService.sendPhoneVerificationCode(userId, body.phone);
  }

  // ─── Authenticated: Role management ────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('add-role')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a new role to the current user account' })
  async addRole(@CurrentUser('id') userId: string, @Body() body: { role: string }) {
    return this.authService.addRole(userId, body.role);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-roles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user roles' })
  async getMyRoles(@CurrentUser('id') userId: string) {
    return this.authService.getMyRoles(userId);
  }

  // ─── Legacy: Google-only route (backward compat) ──────────────────────────

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Deprecated] Use POST /auth/social instead' })
  async googleAuth(@Body() body: { accessToken: string; email?: string; name?: string }) {
    return this.authService.socialLogin({
      provider: 'google',
      token: body.accessToken,
      email: body.email,
      name: body.name,
    });
  }
}
