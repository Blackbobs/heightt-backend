# Direct entry dues: frontend integration

## Behavior

A direct entry student is a student onboarding at 200 level or above who must pay selected 100 level dues.

The backend now enforces these audiences:

| Student | Dues returned on the dashboard |
| --- | --- |
| Regular 100 level student | All dues with `isFresher: true` |
| Regular 200 level or above student | All dues with `isFresher: false` |
| Direct entry student at 200 level or above | Only dues with both `isFresher: true` and `isDirectEntryEligible: true` |

Direct entry students do not receive 200-level-and-above dues. Existing membership, active status, session, payment, and arrears rules still apply.

## Student onboarding

Both onboarding institution payloads accept the new optional boolean `isDirectEntry`:

- `PATCH /api/v1/onboarding/institution`
- `POST /api/v1/onboarding/complete`

Example for `PATCH /api/v1/onboarding/institution`:

```json
{
  "institutionId": "institution-id",
  "facultyId": "faculty-id",
  "departmentId": "department-id",
  "levelId": "200-level-id",
  "matricNumber": "MAT/2026/001",
  "isFresher": false,
  "isDirectEntry": true,
  "sessionId": "session-id"
}
```

Example for `POST /api/v1/onboarding/complete`:

```json
{
  "firstName": "Ada",
  "lastName": "Okafor",
  "institution": "Heightt University",
  "faculty": "Engineering",
  "department": "Computer Science",
  "academicLevelId": "200-level-id",
  "matricNumber": "MAT/2026/001",
  "isFresher": false,
  "isDirectEntry": true,
  "sessionId": "session-id"
}
```

Frontend rules:

- Show the direct entry control only after the selected academic level has a numeric level of 200 or higher.
- Send `isDirectEntry: true` when selected.
- Send `isDirectEntry: false` when not selected. Omitting it also defaults to `false`.
- Reset it to `false` if the user changes the selected level to 100.
- Send a JSON boolean, not a string or number.

The backend rejects `isDirectEntry: true` below 200 level with HTTP 400:

```json
{
  "statusCode": 400,
  "message": "Direct entry students must select 200 level or above",
  "error": "Bad Request"
}
```

Student profile responses now include `isDirectEntry: boolean` where the student profile is returned.

## Admin due creation

For the complete admin form, list, payload, validation, and assignment contract, see [Admin dashboard: direct entry due creation](admin-direct-entry-dues-dashboard.md).

`POST /api/v1/finance/dues` accepts the new optional boolean `isDirectEntryEligible`.

This option is valid only for a 100 level due, which means `isFresher` must also be `true`:

```json
{
  "organizationId": "organization-id",
  "sessionId": "session-id",
  "name": "Faculty Development Levy",
  "description": "Required for new entrants",
  "amount": 500000,
  "isFresher": true,
  "isDirectEntryEligible": true,
  "isRequired": true,
  "status": "ACTIVE"
}
```

Suggested controls:

1. Keep the existing due audience control for 100 level versus 200 level and above.
2. When the audience is 100 level, show a checkbox labeled `Also make this due available to direct entry students`.
3. Hide and reset the checkbox when the audience changes to 200 level and above.

Sending `isDirectEntryEligible: true` with `isFresher: false` returns HTTP 400:

```json
{
  "statusCode": 400,
  "message": "Only 100 level dues can be made available to direct entry students",
  "error": "Bad Request"
}
```

The created due and items from `GET /api/v1/finance/dues` include:

```ts
type Due = {
  isFresher: boolean;
  isDirectEntryEligible: boolean;
  // Existing due fields remain unchanged.
};
```

Both new fields default to `false`, so existing frontend payloads continue to work.

## Student dashboard and payment

Continue fetching the dashboard list from:

`GET /api/v1/finance/dues/student`

No query parameter is required. The backend reads `studentProfile.isDirectEntry` and the current academic level. Render the returned list directly.

The payment payload remains unchanged:

```ts
const paymentInput = item.isAutoAssigned
  ? { dueId: item.dueId }
  : { dueAssignmentId: item.id };
```

Eligibility is checked again for explicit assignments, automatic assignment, and direct internal payment. A direct entry student cannot pay:

- a 100 level due that did not opt in to direct entry students;
- a 200-level-and-above due;
- any due while their selected level is below 200.

A rejected payment returns HTTP 403 with `This due is not available for your academic level`.

## Migration and deployment

Migration `20260922170000_add_direct_entry_dues` adds:

- `student_profiles.isDirectEntry`, non-null and defaulting to `false`;
- `dues.isDirectEntryEligible`, non-null and defaulting to `false`.

All existing students and dues remain regular by default. No existing student is automatically classified as direct entry, and no existing 100 level due is automatically opened to direct entry students.

Apply and generate before starting the updated API:

```sh
npm run db:deploy
npm run db:generate
npm run build
```

## Acceptance checks

1. A regular 100 level student sees all 100 level dues.
2. A regular 200 level student sees only 200-level-and-above dues.
3. A direct entry 200 level student sees only opted-in 100 level dues.
4. A direct entry student does not see ordinary 100 level dues or 200-level-and-above dues.
5. A direct entry student can pay an opted-in due using either `dueId` or an existing `dueAssignmentId`.
6. Payment attempts for any other audience return HTTP 403.
7. The admin form prevents the direct entry option on a 200-level-and-above due.
8. Changing onboarding level to 100 clears the direct entry selection.
