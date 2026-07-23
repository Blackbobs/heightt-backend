import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  // Global Prefix - THIS IS IMPORTANT
  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT || 3000);
  logger.log(
    `🚀 Application running on: http://localhost:${process.env.PORT || 3000}`,
  );
  logger.log(
    `📚 API Base URL: http://localhost:${process.env.PORT || 3000}/api`,
  );
}
bootstrap();
