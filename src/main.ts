// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  ValidationPipe,
  Logger,
  VersioningType,
  BadRequestException,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import csurf from 'csurf';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Get config service
  const configService = app.get(ConfigService);
  const isProduction = configService.get('NODE_ENV') === 'production';

  // ============================================
  // 1. SECURITY HEADERS (Helmet)
  // ============================================
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'https:'],
          connectSrc: ["'self'", 'https://api.paystack.co'],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      dnsPrefetchControl: true,
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
    }),
  );

  // ============================================
  // 2. Cookie Parser (with security options)
  // ============================================
  app.use(cookieParser());

  // ============================================
  // 3. CSRF Protection (only in production)
  // ============================================
  if (isProduction) {
    app.use(
      csurf({
        cookie: {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
        },
        ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
      }),
    );
    logger.log('🔒 CSRF protection enabled');
  }

  // ============================================
  // 4. Global Validation Pipe (Enhanced)
  // ============================================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      validationError: {
        target: false,
        value: false,
      },
      exceptionFactory: (errors) => {
        const messages = errors.map(
          (error) =>
            `${error.property} - ${Object.values(error.constraints || {}).join(', ')}`,
        );
        return new BadRequestException({
          message: 'Validation failed',
          errors: messages,
          statusCode: 400,
        });
      },
    }),
  );

  // ============================================
  // 5. CORS Configuration (Enhanced)
  // ============================================
  const allowedOrigins = configService
    .get('FRONTEND_URL', 'http://localhost:3000,http://localhost:3001')
    .split(',');

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin) || !isProduction) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cookie',
      'X-Requested-With',
      'X-CSRF-Token',
      'Accept',
      'Origin',
    ],
    exposedHeaders: [
      'Set-Cookie',
      'X-Total-Count',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
  });

  // ============================================
  // 6. Global Prefix & Versioning
  // ============================================
  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'v',
    defaultVersion: '1',
  });

  // ============================================
  // 7. Swagger Documentation (Enhanced)
  // ============================================
  const config = new DocumentBuilder()
    .setTitle('Heightt API')
    .setDescription(
      'Heightt - Financial Management for Students API Documentation\n\n' +
        '## Authentication\n' +
        'This API uses JWT tokens for authentication. Tokens are provided via:\n' +
        '- **Bearer Token**: For mobile/SPA clients\n' +
        '- **HTTP-only Cookies**: For web clients (more secure)\n\n' +
        '## Rate Limiting\n' +
        '- Global: 100 requests per minute\n' +
        '- Authenticated: 200 requests per minute\n' +
        '- Auth endpoints: 5 requests per minute\n\n' +
        '## Security\n' +
        '- All endpoints are protected with Helmet.js\n' +
        '- CSRF protection enabled in production\n' +
        '- Input validation and sanitization applied globally',
    )
    .setVersion('1.0')
    .setContact(
      'Heightt Support',
      'https://heightt.com/support',
      'support@heightt.com',
    )
    .setLicense('Proprietary', 'https://heightt.com/terms')
    .addTag('auth', 'Authentication and authorization endpoints')
    .addTag('users', 'User management and profiles')
    .addTag('institutions', 'Institution management')
    .addTag('organizations', 'Organization and club management')
    .addTag('students', 'Student management and records')
    .addTag('finance', 'Financial operations - Wallet, Payments, Dues')
    .addTag('ledger', 'Double-entry ledger and accounting')
    .addTag('receipts', 'Receipt generation and management')
    .addTag('activities', 'Activity/Event management')
    .addTag('governance', 'Elections, Committees, Executive Terms')
    .addTag('communication', 'Notifications and announcements')
    .addTag('platform', 'Platform operations and settings')
    .addTag('dashboard', 'User and admin dashboards')
    .addTag('rbac', 'Role-Based Access Control')
    .addTag('audit', 'Audit logging and trails')
    .addTag('health', 'Health checks and monitoring')
    .addTag('search', 'Search functionality')
    .addTag('analytics', 'Analytics and reporting')
    .addTag('files', 'File management and uploads')
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
      description: 'Access token stored in HTTP-only cookie (more secure)',
    })
    .addCookieAuth('refreshToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'refreshToken',
      description: 'Refresh token stored in HTTP-only cookie',
    })
    .addServer(
      isProduction ? 'https://api.heightt.com' : 'http://localhost:3000',
      isProduction ? 'Production Server' : 'Development Server',
    )
    .addServer('http://localhost:3000', 'Local Development')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'method',
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
      defaultModelsExpandDepth: 3,
    },
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { font-size: 36px }
      .swagger-ui .scheme-container { background: #f8f9fa }
      .swagger-ui .btn.authorize { background: #4CAF50; color: white; border: none }
      .swagger-ui .btn.authorize svg { fill: white }
    `,
    customSiteTitle: 'Heightt API Documentation',
    customfavIcon: 'https://heightt.com/favicon.ico',
  });

  // ============================================
  // 8. Health Check Endpoint (Added automatically)
  // ============================================
  // This is handled by the HealthController

  // ============================================
  // 9. Global Exception Filter (Optional)
  // ============================================
  // app.useGlobalFilters(new GlobalExceptionFilter());

  // ============================================
  // 10. Start Server
  // ============================================
  const port = configService.get('PORT', 3000);
  const host = configService.get('HOST', '0.0.0.0');
  await app.listen(port, host);

  // ============================================
  // 11. Log Startup Information
  // ============================================
  logger.log('═══════════════════════════════════════════════════════');
  logger.log('🚀 Application is running!');
  logger.log(`📍 URL: http://localhost:${port}`);
  logger.log(`📚 Swagger: http://localhost:${port}/api/docs`);
  logger.log(`🔒 Environment: ${configService.get('NODE_ENV', 'development')}`);
  logger.log(`🌐 CORS Origins: ${allowedOrigins.join(', ')}`);
  logger.log(
    `⏱️  Rate Limit: ${configService.get('THROTTLE_LIMIT', 100)} requests per minute`,
  );
  logger.log('═══════════════════════════════════════════════════════');

  // Log security status
  if (isProduction) {
    logger.log('🔒 Security Features Enabled:');
    logger.log('   ✅ Helmet.js (Security Headers)');
    logger.log('   ✅ CSRF Protection');
    logger.log('   ✅ Strict CORS Policy');
    logger.log('   ✅ Input Validation');
    logger.log('   ✅ Rate Limiting');
    logger.log('   ✅ HTTP-only Cookies');
    logger.log('   ✅ HSTS Preload');
  }
}

bootstrap();
