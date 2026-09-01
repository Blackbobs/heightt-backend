# Institution-wide student promotion frontend

This is the frontend contract for promoting an entire institution into its next academic session.

Only platform admins and the relevant institution's institution admins can run this action. Faculty, department, organisation, and club admins must not see the promotion control.

## Behaviour

One promotion action now:

1. Confirms that the session shown to the administrator is still the institution's current session.
2. Reuses the next institution session if it already exists.
3. Otherwise generates it from the current name, for example `2026/2027` becomes `2027/2028`.
4. Promotes every active student to the next configured level in their department.
5. Creates or updates each promoted student's academic record for the new session.
6. Marks students at their department's final configured level as graduated.
7. Makes the previous session completed and the next session active/current.
8. Preserves previous-session organisation admins for historical documentation while keeping each assignment restricted to its own session.

The operation is atomic. If any database operation fails, none of the session, student, or admin changes are committed.

## Student notification and dashboard behaviour

After the promotion transaction commits, each affected student receives an in-app notification and a branded Heightt email.

Promoted students receive notification data shaped like:

```ts
type StudentPromotionNotification = {
  event: 'STUDENT_PROMOTED';
  studentId: string;
  institutionId: string;
  institutionName: string;
  previousLevelId: string;
  previousLevel: string;
  currentLevelId: string;
  currentLevel: string;
  previousSessionId: string;
  previousSession: string;
  currentSessionId: string;
  currentSession: string;
  promotionId: string;
  promotedAt: string;
};
```

Final-level students receive the same structure with `event: 'STUDENT_GRADUATED'`, `currentLevelId: null`, `currentLevel: null`, and `promotionId: null`.

When the realtime notification gateway emits a notification with either event, show a success banner and refresh the student's academic data:

```ts
function handleAcademicNotification(notification: Notification) {
  const event = notification.data?.event;
  if (event !== 'STUDENT_PROMOTED' && event !== 'STUDENT_GRADUATED') return;

  queryClient.invalidateQueries({ queryKey: ['student-profile'] });
  queryClient.invalidateQueries({ queryKey: ['student-dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['academic-records'] });
  queryClient.invalidateQueries({ queryKey: ['promotion-history'] });
  queryClient.invalidateQueries({ queryKey: ['academic-sessions'] });
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
  queryClient.invalidateQueries({ queryKey: ['dues'] });
}
```

For `STUDENT_PROMOTED`, display: “Congratulations! You have been promoted from {previousLevel} to {currentLevel} for the {currentSession} academic session.”

For `STUDENT_GRADUATED`, display: “You completed {previousLevel} in the {previousSession} academic session. Your academic status is now Graduated.”

The frontend must still use the refreshed student profile as the source of truth. Do not update the level or graduation status locally from the notification alone.

## API client types

```ts
export type AcademicSession = {
  id: string;
  institutionId: string;
  name: string;
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  scope: 'INSTITUTION' | 'FACULTY' | 'DEPARTMENT' | 'LEVEL';
  isCurrent: boolean;
  startDate: string;
  endDate: string;
};

export type InstitutionPromotionResult = {
  institution: {
    id: string;
    name: string;
  };
  previousSession: {
    id: string;
    name: string;
  };
  currentSession: {
    id: string;
    name: string;
    generated: boolean;
  };
  summary: {
    eligible: number;
    promoted: number;
    graduated: number;
    skipped: number;
  };
};
```

The examples below assume the app already has an authenticated, CSRF-aware `apiRequest` helper. Requests must include cookies and an `X-CSRF-Token` header.

## Load the current session

```ts
export async function getInstitutionSessions(
  institutionId: string,
): Promise<AcademicSession[]> {
  return apiRequest(
    `/api/v1/institutions/${encodeURIComponent(institutionId)}/academic-sessions`,
    { method: 'GET' },
  );
}

export async function getCurrentInstitutionSession(institutionId: string) {
  const sessions = await getInstitutionSessions(institutionId);
  return (
    sessions.find(
      (session) => session.scope === 'INSTITUTION' && session.isCurrent,
    ) || null
  );
}
```

Do not choose a faculty-, department-, or level-scoped session for institution promotion.

## Run institution promotion

```ts
export async function promoteInstitution(
  institutionId: string,
  currentSessionId: string,
  notes?: string,
): Promise<InstitutionPromotionResult> {
  return apiRequest(
    `/api/v1/students/institutions/${encodeURIComponent(institutionId)}/promote`,
    {
      method: 'POST',
      body: JSON.stringify({
        currentSessionId,
        ...(notes?.trim() ? { notes: notes.trim() } : {}),
      }),
    },
  );
}
```

Request example:

```json
{
  "currentSessionId": "cm_session_2026",
  "notes": "Approved institution-wide progression"
}
```

The current session ID is required. It is an optimistic concurrency check that prevents an accidental second click, retry, or stale browser tab from advancing the institution twice.

## Promotion screen example

```tsx
'use client';

import { useEffect, useState } from 'react';

type Props = {
  institutionId: string;
};

export function InstitutionPromotionPanel({ institutionId }: Props) {
  const [session, setSession] = useState<AcademicSession | null>(null);
  const [result, setResult] = useState<InstitutionPromotionResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let active = true;

    getCurrentInstitutionSession(institutionId)
      .then((value) => {
        if (active) setSession(value);
      })
      .catch((error) => {
        if (active) {
          setError(
            error instanceof Error
              ? error.message
              : 'Unable to load the current session.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [institutionId]);

  async function handlePromotion() {
    if (!session || !confirmed || promoting) return;

    setPromoting(true);
    setError('');
    try {
      const promotionResult = await promoteInstitution(
        institutionId,
        session.id,
      );
      setResult(promotionResult);
      setSession(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Institution promotion could not be completed.',
      );
    } finally {
      setPromoting(false);
    }
  }

  if (loading) return <p>Loading current academic session…</p>;

  if (result) {
    return (
      <section aria-labelledby="promotion-complete">
        <h2 id="promotion-complete">Promotion completed</h2>
        <p>
          {result.previousSession.name} has advanced to{' '}
          {result.currentSession.name}.
        </p>
        <dl>
          <dt>Students promoted</dt>
          <dd>{result.summary.promoted}</dd>
          <dt>Students graduated</dt>
          <dd>{result.summary.graduated}</dd>
          <dt>Students skipped</dt>
          <dd>{result.summary.skipped}</dd>
        </dl>
        <p>
          {result.currentSession.generated
            ? `The ${result.currentSession.name} session was created automatically.`
            : `The existing ${result.currentSession.name} session was activated.`}
        </p>
      </section>
    );
  }

  if (!session) {
    return (
      <section>
        <h2>Institution promotion</h2>
        <p>No current institution-level academic session was found.</p>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section aria-labelledby="promotion-title">
      <h2 id="promotion-title">Promote institution</h2>
      <p>
        Current session: <strong>{session.name}</strong>
      </p>
      <p>
        This promotes all eligible students, graduates final-level students,
        advances the academic session, and keeps each organisation admin
        restricted to the session they were assigned.
      </p>

      {error && <p role="alert">{error}</p>}

      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={promoting}
        />{' '}
        I understand this action applies to the whole institution.
      </label>

      <button
        type="button"
        onClick={handlePromotion}
        disabled={!confirmed || promoting}
      >
        {promoting ? 'Promoting institution…' : 'Promote institution'}
      </button>
    </section>
  );
}
```

Before rendering the panel, check the authenticated user's active admin scopes. Show it only when either condition is true:

```ts
const canPromoteInstitution = adminScopes.some(
  (scope) =>
    scope.adminType === 'PLATFORM_ADMIN' ||
    (scope.adminType === 'INSTITUTION_ADMIN' &&
      scope.institutionId === institutionId),
);
```

This frontend check controls visibility only. The backend independently enforces the role, institution scope, and `student:promote` permission.

Do not optimistically update student levels. Wait for the completed API response, then invalidate/refetch:

- Institution sessions
- Student lists and student details
- Promotion history and statistics
- Current-user/admin scopes
- Organisation administrator lists

## Error handling

Handle these cases explicitly:

- `400`: The displayed session is stale, its name is not `YYYY/YYYY`, or its years are not consecutive. Refetch sessions before offering another attempt.
- `403`: The signed-in user is not a platform admin or an admin for that institution with promotion permission.
- `404`: The institution no longer exists.

Never automatically retry the promotion POST. A user must review the refreshed current session and confirm again.

## Assign organisation admins for the new session

Only platform admins can assign admin roles. After promotion, use the returned `currentSession.id` when assigning each new organisation admin:

```ts
export type AssignOrganisationAdminInput = {
  userId: string;
  organizationId: string;
  academicSessionId: string;
  adminType?: 'ORGANIZATION_ADMIN' | 'CLUB_ADMIN';
};

export async function assignOrganisationAdmin(
  input: AssignOrganisationAdminInput,
) {
  return apiRequest('/api/v1/rbac/admins/assign', {
    method: 'POST',
    body: JSON.stringify({
      userId: input.userId,
      organizationId: input.organizationId,
      academicSessionId: input.academicSessionId,
      adminType: input.adminType || 'ORGANIZATION_ADMIN',
    }),
  });
}
```

The backend rejects organisation-admin assignments without a session, assignments for a non-current session, and sessions belonging to another institution.

The frontend admin-assignment form must therefore:

1. Require an organisation.
2. Display the institution's current session as read-only context.
3. Submit that session ID as `academicSessionId`.
4. Never offer an old or completed session.

## Access after promotion

Previous organisation admins remain active for their assigned session, including completed sessions. This allows historical reconciliation and documentation without granting access to the new session.

The session selector must only show sessions present in the signed-in user's admin scopes from `/api/v1/auth/me`. Every organisation dashboard request should include the selected `academicSessionId` or `sessionId`. Never infer that an admin can use the current session merely because they administer the same organisation name.

When switching sessions, refetch the dashboard data under the selected session and use a session-specific query/cache key, for example:

```ts
const queryKey = ['organization-dashboard', organizationId, academicSessionId];
```

If the API returns `403`, remove that session from the active view and ask the user to select one of their assigned sessions. Do not fall back automatically to another session.
