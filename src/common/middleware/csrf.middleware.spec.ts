import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { createCsrfMiddleware, getCsrfToken } from './csrf.middleware';

describe('CSRF middleware', () => {
  function createTestApp() {
    const app = express();
    app.use(cookieParser());
    app.use(createCsrfMiddleware(false));
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
