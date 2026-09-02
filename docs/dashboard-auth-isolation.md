# Dashboard authentication isolation

This guide describes the frontend changes required after deploying the scoped
admin authentication backend. It applies to the organization-admin and
platform-admin applications in the Heightt dashboard monorepo.

## Why the change is required

Both dashboards call the same API origin. Cookies belong to the API host, not
to the frontend application that initiated a request. A shared `accessToken`
or `refreshToken` cookie can therefore be overwritten when a user signs into
the other dashboard.

The new flow separates the concerns:

- The `Authorization: Bearer` header selects the identity for API requests.
- A dashboard-specific HTTP-only refresh cookie renews only that dashboard's
  session.
- The shared CSRF secret cookie and `X-CSRF-Token` header protect mutations.
- The backend always checks the bearer header before falling back to the
  regular application's `accessToken` cookie.

## New API contract

| Action     | Organization admin                | Platform admin                       |
| ---------- | --------------------------------- | ------------------------------------ |
| Login      | `POST /api/v1/auth/admin/login`   | `POST /api/v1/auth/platform/login`   |
| Refresh    | `POST /api/v1/auth/admin/refresh` | `POST /api/v1/auth/platform/refresh` |
| Logout     | `POST /api/v1/auth/admin/logout`  | `POST /api/v1/auth/platform/logout`  |
| CSRF token | `GET /api/v1/auth/csrf-token`     | `GET /api/v1/auth/csrf-token`        |

Login and refresh responses include `accessToken`. Store that value only in
the matching dashboard's auth store.

The backend sets one of these production HTTP-only cookies:

- `__Host-heightt.organization.refresh`
- `__Host-heightt.platform.refresh`

They can coexist and are rotated independently. The browser also stores the
shared `__Host-heightt.csrf` secret cookie used by the CSRF middleware.

## Required Axios behavior

Every API request should use `withCredentials: true`. This is required because
the CSRF secret is HTTP-only and must accompany mutations. The bearer header
is still authoritative even if the browser sends another access cookie.

Create a dashboard-specific configuration module. Only the three endpoint
constants differ between applications.

```ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { clearAuth, getAuthState, setAuth } from '@/store/auth-store';

type RetryableConfig = InternalAxiosRequestConfig & {
  _csrfRetry?: boolean;
  _authRetry?: boolean;
};

// Organization-admin values:
const LOGIN_PATH = '/v1/auth/admin/login';
const REFRESH_PATH = '/v1/auth/admin/refresh';
const LOGOUT_PATH = '/v1/auth/admin/logout';

// Platform-admin values:
// const LOGIN_PATH = "/v1/auth/platform/login";
// const REFRESH_PATH = "/v1/auth/platform/refresh";
// const LOGOUT_PATH = "/v1/auth/platform/logout";

const rawBase =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
const baseURL = rawBase.replace(/\/v1$/, '');

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;

async function getCsrfToken(force = false): Promise<string> {
  if (force) csrfToken = null;
  if (csrfToken) return csrfToken;
  if (csrfRequest) return csrfRequest;

  csrfRequest = api
    .get('/v1/auth/csrf-token', { withCredentials: true })
    .then((response) => {
      const token = response.data?.csrfToken ?? response.data?.token;
      if (!token) throw new Error('The API did not return a CSRF token');
      csrfToken = token;
      return token;
    })
    .finally(() => {
      csrfRequest = null;
    });

  return csrfRequest;
}

function clearCsrfToken() {
  csrfToken = null;
}

api.interceptors.request.use(async (config) => {
  const method = config.method?.toLowerCase() || 'get';
  const safeMethod = ['get', 'head', 'options'].includes(method);
  const isCsrfRequest = config.url?.includes('/auth/csrf-token');
  const isCredentialEndpoint =
    isCsrfRequest ||
    [LOGIN_PATH, REFRESH_PATH].some((path) => config.url?.includes(path));

  config.withCredentials = true;

  // Login and refresh are authorized by credentials/refresh cookies. All
  // business requests and logout use this dashboard's bearer token.
  const accessToken = getAuthState().token;
  if (accessToken && accessToken !== 'cookie-auth' && !isCredentialEndpoint) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }

  if (!safeMethod && !isCsrfRequest) {
    config.headers.set('X-CSRF-Token', await getCsrfToken());
  }

  return config;
});
```

## Response interceptor

Retry a stale CSRF token once. For a `401`, refresh through only the current
dashboard's scoped endpoint and replace its bearer token.

```ts
let refreshRequest: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshRequest) return refreshRequest;

  refreshRequest = api
    .post(REFRESH_PATH, {})
    .then((response) => {
      const token = response.data?.accessToken;
      if (!token) throw new Error('The API did not return an access token');

      const currentUser = getAuthState().user;
      setAuth(token, currentUser);
      return token;
    })
    .finally(() => {
      refreshRequest = null;
    });

  return refreshRequest;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetryableConfig | undefined;
    if (!request) throw error;

    const data = error.response?.data as { code?: string } | undefined;

    if (
      error.response?.status === 403 &&
      data?.code === 'CSRF_TOKEN_INVALID' &&
      !request._csrfRetry
    ) {
      request._csrfRetry = true;
      request.headers.set('X-CSRF-Token', await getCsrfToken(true));
      return api(request);
    }

    const isAuthEndpoint = [LOGIN_PATH, REFRESH_PATH].some((path) =>
      request.url?.includes(path),
    );

    if (
      error.response?.status === 401 &&
      !isAuthEndpoint &&
      !request._authRetry
    ) {
      request._authRetry = true;

      try {
        const accessToken = await refreshAccessToken();
        request.headers.set('Authorization', `Bearer ${accessToken}`);
        return api(request);
      } catch (refreshError) {
        clearAuth();
        clearCsrfToken();
        window.location.assign('/signin');
        throw refreshError;
      }
    }

    throw error;
  },
);
```

Do not call the generic `/v1/auth/refresh` endpoint from either admin
dashboard. It is retained for the regular web application and legacy clients.

## Login implementation

Fetch a CSRF token before login because login is a state-changing request.

```ts
export async function login(identifier: string, password: string) {
  clearCsrfToken();
  await getCsrfToken(true);

  const response = await api.post(LOGIN_PATH, { identifier, password });
  const { accessToken, ...user } = response.data;

  if (!accessToken) {
    throw new Error('Login succeeded without an access token');
  }

  setAuth(accessToken, user);
  return user;
}
```

Platform login now rejects users without an active `PLATFORM_ADMIN` role.
Organization-admin login rejects platform-only users. A user who genuinely has
both role classes can maintain one isolated session in each dashboard.

## Withdrawal approval

No endpoint-specific CSRF code is necessary when the interceptors above are
installed:

```ts
export async function approveOrganizationWithdrawal(id: string) {
  const response = await api.post(
    `/v1/finance/withdrawals/organization/${id}/approve`,
    {},
  );
  return response.data;
}
```

The outgoing request will contain:

```text
Authorization: Bearer <platform access token>
X-CSRF-Token: <derived CSRF token>
Cookie: __Host-heightt.platform.refresh=...; __Host-heightt.csrf=...
```

The browser may also send legacy cookies during the migration. They cannot
override the bearer identity after the backend deployment.

## Logout implementation

```ts
export async function logout() {
  try {
    await api.post(LOGOUT_PATH, {});
  } finally {
    clearAuth();
    clearCsrfToken();
    window.location.assign('/signin');
  }
}
```

Scoped logout revokes and clears only the current dashboard session. Logging
out of platform admin does not log out organization admin, and vice versa.

## CORS requirements

The API must:

- Explicitly allow both production dashboard origins.
- Return `Access-Control-Allow-Credentials: true`.
- Never use `Access-Control-Allow-Origin: *` with credentials.
- Allow `Authorization`, `Content-Type`, and `X-CSRF-Token` headers.
- Allow `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS` as needed.

## Deployment sequence

1. Deploy the database migration and backend together.
2. Confirm the new platform login and scoped refresh endpoints respond.
3. Deploy the platform dashboard with the platform endpoint constants.
4. Deploy the organization dashboard with the organization endpoint constants.
5. Ask all admin-dashboard users to sign in again once.
6. After migration, remove any dashboard calls to generic `/auth/refresh` and
   `/auth/logout`.

The database migration adds `sessions.authClient`. Existing sessions are
classified as `USER`; they cannot be consumed by either new scoped refresh
endpoint. Existing access tokens remain valid until their short expiry, but
bearer-first extraction prevents cookie identity switching immediately.

## Acceptance checks

Run these checks in one browser profile:

1. Log into organization admin as user A.
2. Log into platform admin as user B.
3. Reload organization admin; it must still show user A.
4. Reload platform admin; it must still show user B.
5. Approve a withdrawal in platform admin; it must pass CSRF validation.
6. Let both access tokens expire and trigger refresh in each dashboard; each
   dashboard must remain the same user.
7. Log out of platform admin; organization admin must remain signed in.
8. Attempt platform login with an organization-only admin; expect `401`.
9. Attempt organization login with a platform-only admin; expect `401`.
10. Confirm mutation requests without `X-CSRF-Token` still return
    `CSRF_TOKEN_INVALID`.

## Rollback

If a dashboard deployment must be rolled back, the generic user login,
refresh, and logout endpoints remain available. Do not roll back only the
database migration while the new backend is running because the generated
queries expect `sessions.authClient` to exist.
