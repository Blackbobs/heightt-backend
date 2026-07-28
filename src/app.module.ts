import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.development'],
    }),
    PrismaModule,
    RedisModule,
    EmailModule,
    AuthModule,
    OnboardingModule,
    CloudinaryModule,
  ],
})
export class AppModule {}
