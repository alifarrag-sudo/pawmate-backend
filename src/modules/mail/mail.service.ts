import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend | null = null;
  private from: string;

  constructor(private config: ConfigService) {
    const apiKey = config.get<string>('EMAIL_API_KEY');
    this.from = config.get<string>('EMAIL_FROM', 'hello@pawmateegypt.com');

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend mail service initialized');
    } else {
      this.logger.warn('EMAIL_API_KEY not set — emails will be logged only');
    }
  }

  async sendWelcome(user: { email: string; firstName: string }): Promise<void> {
    await this.send(
      user.email,
      'Welcome to PawMate! 🐾',
      this.wrapTemplate(`
        <h1 style="color: #2C1810; font-size: 28px; margin-bottom: 16px;">Welcome, ${this.escapeHtml(user.firstName)}!</h1>
        <p style="color: #5C4A3E; font-size: 16px; line-height: 1.6;">
          You're now part of Egypt's first AI-powered pet care community. Whether you're a pet parent looking for trusted care or a PetFriend ready to help — we've got you covered.
        </p>
        <a href="https://pawmateegypt.com" style="display: inline-block; background: #E8723A; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin-top: 16px;">
          Get Started
        </a>
      `),
    );
  }

  async sendEmailVerification(user: { email: string; firstName: string }, token: string): Promise<void> {
    const link = `https://pawmateegypt.com/verify-email?t=${token}`;
    await this.send(
      user.email,
      'Verify your PawMate email',
      this.wrapTemplate(`
        <h1 style="color: #2C1810; font-size: 28px; margin-bottom: 16px;">Verify your email</h1>
        <p style="color: #5C4A3E; font-size: 16px; line-height: 1.6;">
          Hi ${this.escapeHtml(user.firstName)}, click the button below to verify your email address. This link expires in 1 hour.
        </p>
        <a href="${link}" style="display: inline-block; background: #E8723A; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin-top: 16px;">
          Verify Email
        </a>
        <p style="color: #8B7A6B; font-size: 13px; margin-top: 24px;">
          If the button doesn't work, copy this link:<br/>
          <a href="${link}" style="color: #E8723A;">${link}</a>
        </p>
      `),
    );
  }

  async sendPasswordReset(user: { email: string; firstName: string }, token: string): Promise<void> {
    const link = `https://pawmateegypt.com/reset?t=${token}`;
    await this.send(
      user.email,
      'Reset your PawMate password',
      this.wrapTemplate(`
        <h1 style="color: #2C1810; font-size: 28px; margin-bottom: 16px;">Reset your password</h1>
        <p style="color: #5C4A3E; font-size: 16px; line-height: 1.6;">
          Hi ${this.escapeHtml(user.firstName)}, we received a request to reset your password. Click below to set a new one. This link expires in 1 hour.
        </p>
        <a href="${link}" style="display: inline-block; background: #E8723A; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin-top: 16px;">
          Reset Password
        </a>
        <p style="color: #8B7A6B; font-size: 13px; margin-top: 24px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      `),
    );
  }

  private wrapTemplate(bodyContent: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #FAF8F5; font-family: 'DM Sans', -apple-system, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FAF8F5; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 560px; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(44, 24, 16, 0.06);">
          <tr>
            <td style="text-align: center; padding-bottom: 24px;">
              <img src="https://pawmateegypt.com/logo.png" alt="PawMate" width="120" style="display: inline-block;" />
            </td>
          </tr>
          <tr>
            <td>
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="padding-top: 32px; border-top: 1px solid #E5DED2; margin-top: 32px;">
              <p style="color: #8B7A6B; font-size: 12px; line-height: 1.5; text-align: center;">
                AJ Technologies LLC, Cairo, Egypt<br/>
                <a href="https://pawmateegypt.com/unsubscribe" style="color: #8B7A6B;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.log(`[MAIL-STUB] To: ${to} | Subject: ${subject}`);
      return;
    }

    try {
      await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
    }
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
