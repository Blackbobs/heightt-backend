import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export function extractAccessToken(request: Request): string | null {
  const authHeader = request?.headers?.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return request?.cookies?.accessToken || null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_ACCESS_SECRET is not defined in environment variables',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          // A dashboard-specific bearer identity must win when the browser
          // also sends cookies belonging to another Heightt application.
          const authHeader = request?.headers?.authorization;
          if (authHeader?.startsWith('Bearer ')) {
            this.logger.debug('✅ Token extracted from Authorization header');
            return extractAccessToken(request);
          }

          // Cookie authentication remains available for the regular web app.
          const token = extractAccessToken(request);
          if (token) {
            this.logger.debug('✅ Token extracted from cookie');
            return token;
          }

          return null;
        },
      ]),
      secretOrKey: secret,
      ignoreExpiration: false,
      passReqToCallback: true, // Pass request to validate method
    });
  }

  async validate(req: Request, payload: any) {
    this.logger.debug(`🔍 Validating user: ${payload.sub}`);

    // Check if token is expired
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      this.logger.warn(`❌ Token expired for user: ${payload.sub}`);
      throw new UnauthorizedException('Access token expired');
    }

    // Check token type
    if (payload.type && payload.type !== 'access') {
      this.logger.warn(`❌ Invalid token type for user: ${payload.sub}`);
      throw new UnauthorizedException('Invalid token type');
    }

    // Authentication only needs the account fields below. Loading profile and
    // studentProfile here added two joins to every authenticated request even
    // though request handlers only consume the user's identity.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        status: true,
      },
    });

    if (!user) {
      this.logger.warn(`❌ User not found: ${payload.sub}`);
      throw new UnauthorizedException('User not found');
    }

    // Check user status
    if (
      user.status === 'DELETED' ||
      user.status === 'INACTIVE' ||
      user.status === 'SUSPENDED'
    ) {
      this.logger.warn(
        `❌ User inactive, suspended, or deleted: ${payload.sub}`,
      );
      throw new UnauthorizedException('User account is inactive');
    }

    this.logger.debug(`✅ User validated: ${user.email}`);
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      sessionId: payload.sessionId,
      authClient: payload.authClient || 'USER',
    };
  }
}
