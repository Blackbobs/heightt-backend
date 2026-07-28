import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

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
          const token = request?.cookies?.accessToken;
          if (token) {
            this.logger.debug('✅ Token extracted from cookie');
          }
          return token || null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: secret,
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    this.logger.debug(`🔍 Validating user: ${payload.sub}`);

    // Check if token is expired
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      this.logger.warn(`❌ Token expired for user: ${payload.sub}`);
      throw new UnauthorizedException('Token expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        profile: true,
        studentProfile: true,
      },
    });

    if (!user) {
      this.logger.warn(`❌ User not found: ${payload.sub}`);
      throw new UnauthorizedException('User not found');
    }

    // Check user status instead of isActive/isDeleted
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
      profile: user.profile,
      studentProfile: user.studentProfile,
    };
  }
}
