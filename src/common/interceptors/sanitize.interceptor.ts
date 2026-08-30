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

    // Sanitize request body - this is writable
    if (request.body) {
      request.body = this.sanitizeObject(request.body);
    }

    // Sanitize query parameters - use Object.assign instead of direct assignment
    if (request.query && typeof request.query === 'object') {
      const sanitizedQuery = this.sanitizeObject(request.query);
      // Clear existing keys and assign new ones
      Object.keys(request.query).forEach(key => delete request.query[key]);
      Object.assign(request.query, sanitizedQuery);
    }

    // Sanitize URL parameters - use Object.assign instead of direct assignment
    if (request.params && typeof request.params === 'object') {
      const sanitizedParams = this.sanitizeObject(request.params);
      // Clear existing keys and assign new ones
      Object.keys(request.params).forEach(key => delete request.params[key]);
      Object.assign(request.params, sanitizedParams);
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

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    // Handle objects
    if (typeof obj === 'object') {
      const sanitized = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          if (typeof value === 'string') {
            // Only sanitize strings that contain HTML
            if (this.containsHtml(value)) {
              sanitized[key] = sanitizeHtml(value, {
                allowedTags: [],
                allowedAttributes: {},
                disallowedTagsMode: 'discard',
                selfClosing: ['br', 'hr'],
                allowedSchemes: ['http', 'https', 'mailto'],
              });
            } else {
              sanitized[key] = value;
            }
          } else if (Array.isArray(value)) {
            sanitized[key] = value.map((item) => this.sanitizeObject(item));
          } else if (value && typeof value === 'object') {
            sanitized[key] = this.sanitizeObject(value);
          } else {
            sanitized[key] = value;
          }
        }
      }
      return sanitized;
    }

    return obj;
  }

  private containsHtml(text: string): boolean {
    return /<[a-z][\s\S]*>/i.test(text);
  }
}