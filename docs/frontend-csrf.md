# Frontend CSRF integration

CSRF protection is enabled in development and production. It uses a secret in
an HTTP-only cookie plus a derived token that JavaScript sends in a header. The
cookie value is intentionally not exposed and must not be copied into the
header.

## Request flow

1. Call `GET /api/v1/auth/csrf-token` with browser credentials enabled.
2. Store the `csrfToken` value from the JSON response in memory.
3. For every `POST`, `PUT`, `PATCH`, or `DELETE`, send that value in the
   `X-CSRF-Token` header and keep credentials enabled.
4. If the API returns `403` with `code: "CSRF_TOKEN_INVALID"`, fetch a fresh
   token once and retry the original request once. This handles expired or
   cleared browser cookies.

The token endpoint can be called before login. Login, registration, refresh,
and logout are state-changing requests, so they also require the header.
`GET`, `HEAD`, and `OPTIONS` do not require it.

## Fetch example

```ts
const API_URL = import.meta.env.VITE_API_URL;
let csrfToken: string | undefined;

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;

  const response = await fetch(`${API_URL}/api/v1/auth/csrf-token`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Could not initialize CSRF protection');

  csrfToken = (await response.json()).csrfToken;
  return csrfToken;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const method = (init.method ?? 'GET').toUpperCase();
  const changesState = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const headers = new Headers(init.headers);

  if (changesState) headers.set('X-CSRF-Token', await ensureCsrfToken());

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
}
```

For Axios, set `withCredentials: true` and add the same header in a request
interceptor. Do not persist the token in local storage; keeping it in memory is
sufficient because it can always be fetched again.

## Local development

Use the same flow against `http://localhost:<backend-port>`. Ensure the exact
frontend origin is present in `CORS_ORIGIN`. Local cookies are non-secure and
`SameSite=Lax`; production cookies are `Secure; SameSite=None` to support a SPA
and API hosted on different sites. Production must therefore use HTTPS.
