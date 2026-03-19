import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        activeRole: true,
        isOwner: true,
        isSitter: true,
        idVerified: true,
        isActive: true,
        isBanned: true,
        banReason: true,
        walletBalance: true,
        loyaltyTier: true,
        loyaltyPoints: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({ error: 'ACCOUNT_INACTIVE', message: 'Account is not active.' });
    }

    return user;
  }
}
