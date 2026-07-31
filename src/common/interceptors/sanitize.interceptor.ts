// src/common/interceptors/sanitize.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import sanitizeHtml from 'sanitize-html';

@Injectable()
export class SanitizeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Sanitize request body
    if (request.body) {
      request.body = this.sanitizeObject(request.body);
    }

    // Sanitize query parameters
    if (request.query) {
      request.query = this.sanitizeObject(request.query);
    }

    // Sanitize URL parameters
    if (request.params) {
      request.params = this.sanitizeObject(request.params);
    }

    return next.handle().pipe(
      map((data) => {
        // Optionally sanitize response data as well
        return data;
      }),
    );
  }

  private sanitizeObject(obj: any): any {
    if (!obj) return obj;

    const sanitized = { ...obj };
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'string') {
        // Only sanitize strings that contain HTML
        if (this.containsHtml(sanitized[key])) {
          sanitized[key] = sanitizeHtml(sanitized[key], {
            allowedTags: [],
            allowedAttributes: {},
            disallowedTagsMode: 'discard',
            selfClosing: ['br', 'hr'],
            allowedSchemes: ['http', 'https', 'mailto'],
          });
        }
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitizeObject(sanitized[key]);
      }
    }
    return sanitized;
  }

  private containsHtml(text: string): boolean {
    return /<[a-z][\s\S]*>/i.test(text);
  }
}
