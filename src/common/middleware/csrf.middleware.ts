import type { NextFunction, Request, RequestHandler, Response } from 'express';
import csurf from 'csurf';

export const CSRF_HEADER = 'X-CSRF-Token';
export const CSRF_COOKIE = 'heightt.csrf';

const CSRF_EXEMPT_ROUTES = new Set([
  '/api/v1/webhooks/bachs',
  '/api/v1/webhooks/withdrawal',
]);

type CsrfRequest = Request & { csrfToken(): string };

/**
 * Cookie-backed synchronizer-token protection. The HTTP-only cookie contains
 * the secret; clients must echo the derived token returned by the API.
 */
export function createCsrfMiddleware(isProduction: boolean): RequestHandler {
  const protect = csurf({
    cookie: {
      // __Host- cookies require HTTPS, so local HTTP uses an unprefixed name.
      key: isProduction ? `__Host-${CSRF_COOKIE}` : CSRF_COOKIE,
      httpOnly: true,
      secure: isProduction,
      // The deployed SPA and API can live on different sites (for example
      // Vercel and Render), which requires SameSite=None with Secure.
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    },
    ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
    value: (request) => request.get(CSRF_HEADER) || '',
  });

  return (request: Request, response: Response, next: NextFunction) => {
    const path = request.path.replace(/\/+$/, '') || '/';

    // Providers cannot fetch browser tokens; these endpoints independently
    // authenticate requests with cryptographic webhook signatures.
    if (request.method === 'POST' && CSRF_EXEMPT_ROUTES.has(path)) {
      return next();
    }

    protect(request, response, (error?: unknown) => {
      if ((error as { code?: string } | undefined)?.code === 'EBADCSRFTOKEN') {
        return response.status(403).json({
          statusCode: 403,
          error: 'Forbidden',
          code: 'CSRF_TOKEN_INVALID',
          message:
            'CSRF token is missing or invalid. Fetch a new token from GET /api/v1/auth/csrf-token and retry the request.',
        });
      }

      return error ? next(error) : next();
    });
  };
}

export function getCsrfToken(request: Request): string {
  return (request as CsrfRequest).csrfToken();
}
