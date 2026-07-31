// src/common/interceptors/logging.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, query, params, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const startTime = Date.now();

    // Sanitize sensitive data from logs
    const sanitizedBody = this.sanitizeBody(body);

    // Log request
    this.logger.log(
      `📥 ${method} ${url} - IP: ${ip} - UA: ${userAgent.substring(0, 50)}`,
    );

    // Log body for non-GET requests (sanitized)
    if (method !== 'GET' && Object.keys(sanitizedBody).length > 0) {
      this.logger.debug(`📦 Body: ${JSON.stringify(sanitizedBody)}`);
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const responseTime = Date.now() - startTime;
          const statusCode = context.switchToHttp().getResponse().statusCode;

          this.logger.log(
            `📤 ${method} ${url} - ${statusCode} - ${responseTime}ms`,
          );

          // Log response for debugging (but not for large responses)
          if (process.env.NODE_ENV === 'development') {
            const sanitizedResponse = this.sanitizeResponse(data);
            if (
              sanitizedResponse &&
              Object.keys(sanitizedResponse).length < 50
            ) {
              this.logger.debug(
                `📤 Response: ${JSON.stringify(sanitizedResponse)}`,
              );
            }
          }
        },
        error: (error) => {
          const responseTime = Date.now() - startTime;
          this.logger.error(
            `❌ ${method} ${url} - Error: ${error.message} - ${responseTime}ms`,
          );
          this.logger.error(error.stack);
        },
      }),
    );
  }

  private sanitizeBody(body: any): any {
    if (!body) return {};

    const sanitized = { ...body };
    const sensitiveFields = [
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      'accessToken',
    ];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }

  private sanitizeResponse(data: any): any {
    if (!data) return data;

    const sanitized = { ...data };
    const sensitiveFields = ['passwordHash', 'token', 'refreshToken'];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}
