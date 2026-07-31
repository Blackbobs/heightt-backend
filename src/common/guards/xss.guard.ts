// src/common/guards/xss.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';

@Injectable()
export class XssGuard implements CanActivate {
  private readonly dangerousPatterns = [
    /<script.*?>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe.*?>.*?<\/iframe>/gi,
    /<object.*?>.*?<\/object>/gi,
    /<embed.*?>/gi,
    /<applet.*?>.*?<\/applet>/gi,
    /<meta.*?>/gi,
    /<link.*?>/gi,
    /<base.*?>/gi,
  ];

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Check body
    if (request.body) {
      this.checkForXSS(request.body);
    }

    // Check query params
    if (request.query) {
      this.checkForXSS(request.query);
    }

    // Check URL params
    if (request.params) {
      this.checkForXSS(request.params);
    }

    return true;
  }

  private checkForXSS(obj: any) {
    if (!obj) return;

    for (const key in obj) {
      const value = obj[key];
      if (typeof value === 'string') {
        for (const pattern of this.dangerousPatterns) {
          if (pattern.test(value)) {
            throw new BadRequestException(
              `Potential XSS attack detected in field: ${key}`,
            );
          }
        }
      } else if (typeof value === 'object') {
        this.checkForXSS(value);
      }
    }
  }
}
