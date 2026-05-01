import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

interface JwtPayload {
  sub: string;
  email?: string;
  roles?: string[];
  activeRole?: string;
}

/**
 * Pure JWT validation — verifies signature & expiry via passport-jwt and
 * returns a session-shaped object derived from the payload only.
 *
 * Identity contract:
 *   request.user = { id, email, roles, activeRole }
 *
 * Status checks (banned / deleted / inactive) live in JwtAuthGuard which has
 * Redis-backed caching to avoid hitting the DB on every request.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
      activeRole: payload.activeRole,
    };
  }
}
