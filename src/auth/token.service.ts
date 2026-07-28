import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async generateAccessToken(userId: string, email: string): Promise<string> {
    const payload = {
      sub: userId,
      email,
      type: 'access',
    };

    // JWT expects seconds, not a string with 'm'
    const expiresIn = parseInt(
      this.configService.get('JWT_ACCESS_EXPIRY', '900'),
      10,
    );
    this.logger.debug(`Generating access token with expiry: ${expiresIn}s`);

    return this.jwtService.signAsync(payload, {
      expiresIn: expiresIn, // seconds
    });
  }

  async generateRefreshToken(userId: string, email: string): Promise<string> {
    const payload = {
      sub: userId,
      email,
      type: 'refresh',
    };

    const expiresIn = parseInt(
      this.configService.get('JWT_REFRESH_EXPIRY', '2592000'),
      10,
    );
    this.logger.debug(`Generating refresh token with expiry: ${expiresIn}s`);

    return this.jwtService.signAsync(payload, {
      expiresIn: expiresIn, // seconds
    });
  }

  async hashRefreshToken(token: string): Promise<string> {
    return argon2.hash(token, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  async verifyRefreshTokenHash(token: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, token);
    } catch (error) {
      this.logger.error(`Refresh token verification failed: ${error.message}`);
      return false;
    }
  }

  async verifyAccessToken(token: string): Promise<any> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      });
    } catch (error) {
      this.logger.debug(`Access token verification failed: ${error.message}`);
      return null;
    }
  }

  async verifyRefreshToken(token: string): Promise<any> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      this.logger.debug(`Refresh token verification failed: ${error.message}`);
      return null;
    }
  }

  decodeToken(token: string): any {
    try {
      return this.jwtService.decode(token);
    } catch {
      return null;
    }
  }
}
