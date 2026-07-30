// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
    ],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    exposedHeaders: ['Set-Cookie'],
  });

  app.setGlobalPrefix('api');

  // ============================================
  // SWAGGER SETUP
  // ============================================
  const config = new DocumentBuilder()
    .setTitle('Heightt API')
    .setDescription(
      'Heightt - Financial Management for Students API Documentation',
    )
    .setVersion('1.0')
    .addTag(
      'auth',
      'Authentication endpoints - Register, Login, Logout, Email Verification',
    )
    .addTag('users', 'User management')
    .addTag('onboarding', 'User onboarding workflow')
    .addTag('institutions', 'Institution management')
    .addTag('organizations', 'Organization management')
    .addTag('finance', 'Financial operations - Wallets, Payments, Transactions')
    .addTag('governance', 'Elections, Committees, Executive Terms')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token obtained from login',
        in: 'header',
      },
      'access-token',
    )
    .addCookieAuth('accessToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'accessToken',
      description:
        'Access token stored in HTTP-only cookie (set automatically on login)',
    })
    .addCookieAuth('refreshToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'refreshToken',
      description:
        'Refresh token stored in HTTP-only cookie (set automatically on login)',
    })
    .addServer(
      process.env.API_URL || 'http://localhost:3000',
      'Development Server',
    )
    .addServer('https://api.heightt.com', 'Production Server')
    .setContact(
      'Heightt Support',
      'https://heightt.com/support',
      'support@heightt.com',
    )
    .setLicense('Proprietary', 'https://heightt.com/legal')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info { margin: 20px 0 }
      .swagger-ui .info .title { font-size: 32px }
      .swagger-ui .scheme-container { background: #f8f9fa }
    `,
    customSiteTitle: 'Heightt API Documentation',
  });

  await app.listen(process.env.PORT || 3000);
  logger.log(
    `🚀 Application running on: http://localhost:${process.env.PORT || 3000}`,
  );
  logger.log(
    `📚 Swagger docs: http://localhost:${process.env.PORT || 3000}/api/docs`,
  );
}
bootstrap();
