# Password reset frontend integration

This is a copy-ready implementation for a Next.js App Router application using TypeScript. It does not require Tailwind CSS or a component library.

The backend endpoints are:

- `GET /api/v1/auth/csrf-token`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

## 1. Environment variable

Add this to `.env.local` in the frontend project. Do not add a trailing slash.

```env
NEXT_PUBLIC_API_URL=https://your-heightt-api.example.com
```

Restart the frontend development server after changing this value.

## 2. API client

Create `src/lib/password-reset-api.ts`:

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');

type ApiErrorBody = {
  message?: string | string[];
  errors?: string[];
};

function requireApiUrl(): string {
  if (!API_URL) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured.');
  }

  return API_URL;
}

async function readResponse(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : null;

  if (response.ok) return body;

  const errorBody = (body || {}) as ApiErrorBody;
  const message = Array.isArray(errorBody.errors)
    ? errorBody.errors.join(' ')
    : Array.isArray(errorBody.message)
      ? errorBody.message.join(' ')
      : errorBody.message;

  throw new Error(message || 'Something went wrong. Please try again.');
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch(`${requireApiUrl()}/api/v1/auth/csrf-token`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const body = await readResponse(response);

  if (!body?.csrfToken) {
    throw new Error('Unable to initialise a secure request. Please refresh.');
  }

  return body.csrfToken;
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const csrfToken = await getCsrfToken();
  const response = await fetch(`${requireApiUrl()}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(payload),
  });

  return readResponse(response) as Promise<T>;
}

export function requestPasswordReset(email: string) {
  return post<{ message: string }>('/api/v1/auth/forgot-password', {
    email: email.trim().toLowerCase(),
  });
}

export function resetPassword(token: string, newPassword: string) {
  return post<{ message: string }>('/api/v1/auth/reset-password', {
    token,
    newPassword,
  });
}
```

`credentials: 'include'` is required because CSRF protection uses a secure HTTP-only cookie.

## 3. Shared page styles

Create `src/app/auth.module.css`:

```css
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  background: #f1f5f9;
  font-family: Arial, Helvetica, sans-serif;
}

.card {
  width: 100%;
  max-width: 440px;
  padding: 36px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
}

.logo {
  display: block;
  width: 132px;
  height: auto;
  margin-bottom: 28px;
}

.title {
  margin: 0 0 10px;
  color: #0f172a;
  font-size: 28px;
  line-height: 36px;
}

.description {
  margin: 0 0 26px;
  color: #64748b;
  font-size: 15px;
  line-height: 23px;
}

.field {
  margin-bottom: 18px;
}

.label {
  display: block;
  margin-bottom: 7px;
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
}

.input {
  box-sizing: border-box;
  width: 100%;
  height: 48px;
  padding: 0 13px;
  color: #0f172a;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font: inherit;
  font-size: 16px;
  outline: none;
}

.input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.button {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  padding: 12px 18px;
  color: #ffffff;
  background: #2563eb;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  line-height: 24px;
  text-align: center;
  text-decoration: none;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.message {
  margin: 0 0 20px;
  padding: 12px 14px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 21px;
}

.error {
  color: #991b1b;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.success {
  color: #166534;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.linkRow {
  margin: 22px 0 0;
  text-align: center;
  color: #64748b;
  font-size: 14px;
}

.link {
  color: #2563eb;
  font-weight: 700;
  text-decoration: none;
}

.hint {
  margin: 7px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 18px;
}

@media (max-width: 520px) {
  .page {
    align-items: flex-start;
    padding: 20px 12px;
  }

  .card {
    padding: 28px 22px;
  }
}
```

## 4. Forgot-password page

Create `src/app/forgot-password/page.tsx`:

```tsx
'use client';

import FormEvent, { useState } from 'react';
import Link from 'next/link';
import { requestPasswordReset } from '@/lib/password-reset-api';
import styles from '../auth.module.css';

const LOGO_URL =
  'https://res.cloudinary.com/dbcgdaigj/image/upload/v1788163976/Page_2-removebg-preview_oy5czj.png';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestPasswordReset(email);
      setMessage(result.message);
      setEmail('');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to process your request. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="page-title">
        <img className={styles.logo} src={LOGO_URL} alt="Heightt" />

        <h1 id="page-title" className={styles.title}>
          Reset your password
        </h1>
        <p className={styles.description}>
          Enter your account email and we will send you a secure reset link.
        </p>

        {error && (
          <div className={`${styles.message} ${styles.error}`} role="alert">
            {error}
          </div>
        )}
        {message && (
          <div
            className={`${styles.message} ${styles.success}`}
            role="status"
          >
            {message}
          </div>
        )}

        {!message && (
          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">
                Email address
              </label>
              <input
                className={styles.input}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                maxLength={255}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting}
              />
            </div>

            <button className={styles.button} disabled={submitting}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className={styles.linkRow}>
          Remembered your password?{' '}
          <Link className={styles.link} href="/login">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
```

Do not display a different result based on whether the email belongs to an account. The backend deliberately returns a neutral response.

## 5. Reset-password page

Create `src/app/reset-password/page.tsx`:

```tsx
'use client';

import FormEvent, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { resetPassword } from '@/lib/password-reset-api';
import styles from '../auth.module.css';

const LOGO_URL =
  'https://res.cloudinary.com/dbcgdaigj/image/upload/v1788163976/Page_2-removebg-preview_oy5czj.png';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!token) {
      setError('This password reset link is invalid. Request a new link.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
      window.history.replaceState({}, '', '/reset-password');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'This reset link is invalid or has expired.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="page-title">
        <img className={styles.logo} src={LOGO_URL} alt="Heightt" />

        <h1 id="page-title" className={styles.title}>
          {success ? 'Password updated' : 'Create a new password'}
        </h1>
        <p className={styles.description}>
          {success
            ? 'Your password was changed and your existing sessions were signed out.'
            : 'Choose a new password for your Heightt account.'}
        </p>

        {error && (
          <div className={`${styles.message} ${styles.error}`} role="alert">
            {error}
          </div>
        )}

        {success ? (
          <>
            <div
              className={`${styles.message} ${styles.success}`}
              role="status"
            >
              Your password was reset successfully. Sign in again using your
              new password.
            </div>
            <Link className={styles.button} href="/login">
              Sign in
            </Link>
          </>
        ) : token ? (
          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="new-password">
                New password
              </label>
              <input
                className={styles.input}
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={submitting}
              />
              <p className={styles.hint}>Use at least 8 characters.</p>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="confirm-password">
                Confirm new password
              </label>
              <input
                className={styles.input}
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={submitting}
              />
            </div>

            <button className={styles.button} disabled={submitting}>
              {submitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        ) : (
          <>
            <div className={`${styles.message} ${styles.error}`} role="alert">
              This password reset link is missing its token or is invalid.
            </div>
            <Link className={styles.button} href="/forgot-password">
              Request a new link
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className={styles.page}>Loading…</main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
```

## 6. Next.js image configuration (optional)

The examples use a normal `<img>` so they work without extra configuration. If you replace it with `next/image`, allow Cloudinary in `next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/dbcgdaigj/image/upload/**',
      },
    ],
  },
};

export default nextConfig;
```

## 7. Required deployment settings

The backend must include the exact frontend origin in `CORS_ORIGIN`, without relying on wildcard credentials. For example:

```env
CORS_ORIGIN=https://www.heightt.app
FRONTEND_URL=https://www.heightt.app
```

For local development, include the local frontend origin as configured by the backend environment, for example `http://localhost:3000`.

## Security checklist

- Never save the reset token in local storage or session storage.
- Never send the token to analytics, logging, or error-reporting services.
- Remove the token from the address bar after a successful reset.
- Do not reveal whether an email address belongs to a Heightt account.
- Keep `credentials: 'include'` on CSRF and POST requests.
- Use HTTPS in production.
- Do not automatically sign the user in after resetting their password.
- Treat an HTTP `400` response as an invalid, used, or expired link and offer a new reset request.
