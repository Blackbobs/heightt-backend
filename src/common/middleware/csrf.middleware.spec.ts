import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { CookieSettings } from '../config/cookie.config';
import { createCsrfMiddleware, getCsrfToken } from './csrf.middleware';

describe('CSRF middleware', () => {
  function createTestApp(
    settings: CookieSettings = { secure: false, sameSite: 'lax' },
  ) {
    const app = express();
    app.use(cookieParser());
    app.use(createCsrfMiddleware(settings));
    app.get('/api/v1/auth/csrf-token', (req, res) => {
      res.json({ csrfToken: getCsrfToken(req) });
    });
    app.post('/api/v1/example', (_req, res) => res.sendStatus(204));
    app.post('/api/v1/webhooks/bachs', (_req, res) => res.sendStatus(204));
    return app;
  }

  it('issues a derived token and accepts it with the secret cookie', async () => {
    const agent = request.agent(createTestApp());
    const tokenResponse = await agent
      .get('/api/v1/auth/csrf-token')
      .expect(200)
      .expect('set-cookie', /heightt\.csrf=/);

    await agent
      .post('/api/v1/example')
      .set('X-CSRF-Token', tokenResponse.body.csrfToken)
      .expect(204);
  });

  it('validates a token paired with a secure cross-site cookie', async () => {
    const app = createTestApp({ secure: true, sameSite: 'none' });
    const response = await request(app)
      .get('/api/v1/auth/csrf-token')
      .expect(200);
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('__Host-heightt.csrf=');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=None');
    // Explicitly forward the cookie because the test transport is HTTP.
    await request(app)
      .post('/api/v1/example')
      .set('Cookie', cookie.split(';')[0])
      .set('X-CSRF-Token', response.body.csrfToken)
      .expect(204);
    await request(app)
      .post('/api/v1/example')
      .set('X-CSRF-Token', response.body.csrfToken)
      .expect(403);
  });

  it('returns an actionable 403 when a state-changing request has no token', async () => {
    await request(createTestApp())
      .post('/api/v1/example')
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe('CSRF_TOKEN_INVALID');
      });
  });

  it('allows the exact signed webhook route without a CSRF token', async () => {
    await request(createTestApp()).post('/api/v1/webhooks/bachs').expect(204);
  });
});
