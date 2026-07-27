import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { CookieService } from './cookie.service';
import { JwtStrategy } from '../common/strategies/jwt.startegy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: configService.get('JWT_ACCESS_EXPIRY', 900) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, CookieService, JwtStrategy],
  exports: [AuthService, TokenService, CookieService],
})
export class AuthModule {}
