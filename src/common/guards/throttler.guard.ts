// src/common/guards/throttler.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Use user ID if authenticated, otherwise IP address
    const userId = req.user?.id;
    if (userId) {
      return `user:${userId}`;
    }

    // Use IP address with X-Forwarded-For support (for proxies)
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = forwardedFor.split(',');
      return ips[0].trim();
    }

    return req.ip || req.connection?.remoteAddress || 'unknown';
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const path = req.path || req.url || '';

    // Skip rate limiting for health checks
    if (path === '/health' || path.includes('/health')) {
      return true;
    }

    // Skip rate limiting for readiness/liveness probes
    if (
      path === '/readiness' ||
      path === '/liveness' ||
      path.includes('/readiness')
    ) {
      return true;
    }

    // Skip for Swagger docs
    if (path.startsWith('/api/docs') || path.includes('/docs')) {
      return true;
    }

    // Skip for static files
    if (
      path.includes('.css') ||
      path.includes('.js') ||
      path.includes('.json')
    ) {
      return true;
    }

    return false;
  }

  protected async getLimit(context: ExecutionContext): Promise<number> {
    const req = context.switchToHttp().getRequest();

    // Higher limit for authenticated users
    if (req.user?.id) {
      return 200; // 200 requests per minute
    }

    // Stricter limit for auth endpoints
    if (req.path?.includes('/auth/') || req.url?.includes('/auth/')) {
      return 5; // 5 requests per minute
    }

    // Stricter limit for sensitive operations
    if (req.path?.includes('/finance/') || req.url?.includes('/finance/')) {
      return 50; // 50 requests per minute
    }

    return 100; // Default: 100 requests per minute
  }

  protected async getTTL(context: ExecutionContext): Promise<number> {
    const req = context.switchToHttp().getRequest();

    // Auth endpoints have stricter TTL (shorter window)
    if (req.path?.includes('/auth/') || req.url?.includes('/auth/')) {
      return 60 * 1000; // 1 minute window
    }

    return 60 * 1000; // Default: 1 minute window
  }

  // Override handleRequest with correct signature
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl } = requestProps;
    const req = context.switchToHttp().getRequest();

    // Skip if user is an admin
    if (req.user?.isAdmin) {
      return true;
    }

    // Call parent method with the correct signature
    return super.handleRequest(requestProps);
  }
}
