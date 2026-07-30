import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { CookieService } from './cookie.service';
import { JwtStrategy } from '../strategies/jwt.startegy';
import { PermissionService } from './permission.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get('JWT_ACCESS_SECRET');
        const expiresIn = parseInt(
          configService.get('JWT_ACCESS_EXPIRY', '900'),
          10,
        );

        return {
          secret: secret,
          signOptions: {
            expiresIn: expiresIn, // seconds
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    CookieService,
    JwtStrategy,
    PermissionService,
  ],
  exports: [AuthService, TokenService, CookieService, PermissionService],
})
export class AuthModule {}
