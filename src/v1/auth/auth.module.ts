import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { CookieService } from './cookie.service';
import { JwtStrategy } from '../../strategies/jwt.startegy';
import { PermissionService } from './permission.service'; // Add this import

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: parseInt(
            configService.get('JWT_ACCESS_EXPIRY', '900'),
            10,
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    CookieService,
    JwtStrategy,
    PermissionService, // Add PermissionService here
  ],
  exports: [
    AuthService,
    TokenService,
    CookieService,
    PermissionService, // Export PermissionService so other modules can use it
  ],
})
export class AuthModule {}
