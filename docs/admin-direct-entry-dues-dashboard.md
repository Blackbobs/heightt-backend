# Admin dashboard: direct entry due creation

## Backend endpoint

Create dues with the existing endpoint:

`POST /api/v1/finance/dues`

The endpoint still requires admin authentication and the `finance:due:create` permission.

The new request field is:

```ts
isDirectEntryEligible?: boolean;
```

It controls whether a due created for 100 level students should also be shown to direct entry students at 200 level or above.

## Admin form behavior

Keep the existing due audience selection:

| Admin selection | Request value |
| --- | --- |
| 100 level students | `isFresher: true` |
| 200 level and above | `isFresher: false` |

Add this checkbox directly below the audience control:

`Also make this due available to direct entry students`

The checkbox behavior must be:

- Show it only when the selected audience is `100 level students`.
- Default it to unchecked.
- Set `isDirectEntryEligible: true` when checked.
- Set `isDirectEntryEligible: false` when unchecked.
- Clear it to `false` whenever the audience changes to `200 level and above`.
- Do not show it for a 200-level-and-above due.

Suggested supporting text:

`Direct entry students at 200 level or above will also see and be able to pay this 100 level due.`

## Suggested frontend types

```ts
type DueAudience = '100_LEVEL' | '200_LEVEL_AND_ABOVE';

type CreateDueFormValues = {
  organizationId: string;
  sessionId?: string;
  name: string;
  description?: string;
  amount: number;
  audience: DueAudience;
  isDirectEntryEligible: boolean;
  isRequired: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'COMPLETED' | 'CANCELLED';
};

type CreateDueRequest = Omit<CreateDueFormValues, 'audience'> & {
  isFresher: boolean;
};
```

## Payload mapping

Build the API payload from the form state:

```ts
function toCreateDueRequest(values: CreateDueFormValues): CreateDueRequest {
  const isFresher = values.audience === '100_LEVEL';

  return {
    organizationId: values.organizationId,
    sessionId: values.sessionId,
    name: values.name,
    description: values.description,
    amount: values.amount,
    isFresher,
    isDirectEntryEligible: isFresher
      ? values.isDirectEntryEligible
      : false,
    isRequired: values.isRequired,
    status: values.status,
  };
}
```

Do not send string booleans such as `"true"` or `"false"`. Send JSON booleans.

## Request examples

### 100 level due available to direct entry students

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

Eligible students:

- Regular 100 level students.
- Direct entry students at 200 level or above.

### 100 level due not available to direct entry students

```json
{
  "organizationId": "organization-id",
  "name": "Freshers Orientation Fee",
  "amount": 200000,
  "isFresher": true,
  "isDirectEntryEligible": false,
  "isRequired": true,
  "status": "ACTIVE"
}
```

Eligible students:

- Regular 100 level students only.

### 200-level-and-above due

```json
{
  "organizationId": "organization-id",
  "name": "Returning Students Levy",
  "amount": 300000,
  "isFresher": false,
  "isDirectEntryEligible": false,
  "isRequired": true,
  "status": "ACTIVE"
}
```

Eligible students:

- Regular students at 200 level or above.
- Direct entry students are excluded.

## Successful response

The endpoint returns the created due. Add `isDirectEntryEligible` to the frontend `Due` type:

```ts
type Due = {
  id: string;
  organizationId: string;
  sessionId: string | null;
  name: string;
  description: string | null;
  amount: number;
  isFresher: boolean;
  isDirectEntryEligible: boolean;
  isRequired: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
};
```

Example response:

```json
{
  "id": "due-id",
  "organizationId": "organization-id",
  "sessionId": "session-id",
  "institutionId": null,
  "name": "Faculty Development Levy",
  "description": "Required for new entrants",
  "amount": 500000,
  "isFresher": true,
  "isDirectEntryEligible": true,
  "isRequired": true,
  "status": "ACTIVE",
  "deletedAt": null,
  "deletedBy": null,
  "createdAt": "2026-09-22T18:00:00.000Z",
  "updatedAt": "2026-09-22T18:00:00.000Z"
}
```

## Backend validation error

The backend rejects this invalid combination:

```json
{
  "isFresher": false,
  "isDirectEntryEligible": true
}
```

Response:

```json
{
  "statusCode": 400,
  "message": "Only 100 level dues can be made available to direct entry students",
  "error": "Bad Request"
}
```

Show that message in the form and reset the direct entry checkbox. The frontend should also prevent this combination before submission.

## Admin dues list

The existing endpoint remains:

`GET /api/v1/finance/dues`

Each item now includes `isDirectEntryEligible` and `isFresher`.

Recommended audience labels:

```ts
function getDueAudienceLabel(due: Due): string {
  if (due.isFresher && due.isDirectEntryEligible) {
    return '100 level and direct entry';
  }

  return due.isFresher
    ? '100 level only'
    : '200 level and above';
}
```

Add an `Audience` column to the admin dues table and use one of these values:

- `100 level and direct entry`
- `100 level only`
- `200 level and above`

Do not infer direct entry eligibility from the due name or description. Always use `isDirectEntryEligible`.

## Assignment screen

The existing assignment endpoint remains unchanged:

`POST /api/v1/finance/dues/:id/assign`

When assigning an opted-in 100 level due, the backend accepts:

- regular 100 level students;
- direct entry students at 200 level or above.

Ineligible selected students are removed by the backend. If no eligible students remain, the endpoint returns HTTP 400 with:

`No students found to assign due`

Use the assignment count returned by the API. Do not show the number of selected rows as the successful assignment count.

## Important limitations

- There is currently no update-due endpoint. The new option applies when creating a due.
- Existing dues default to `isDirectEntryEligible: false`.
- Existing direct entry students are not inferred automatically. Their profiles must explicitly have `isDirectEntry: true`.
- Amounts remain in kobo. For example, `500000` means NGN 5,000.

## Admin dashboard acceptance checks

1. Select `100 level students` and confirm the direct entry checkbox appears.
2. Create a due with the checkbox selected and confirm both request booleans are `true`.
3. Create a 100 level due without selecting the checkbox and confirm `isDirectEntryEligible` is `false`.
4. Change the audience from 100 level to 200 level and confirm the checkbox is cleared and hidden.
5. Confirm a 200-level-and-above payload always sends both flags as `false`.
6. Confirm the dues list shows the correct audience label from the persisted fields.
7. Confirm an opted-in due can be assigned to regular 100 level and direct entry students.
8. Confirm the backend validation message is displayed if an invalid combination is submitted.
