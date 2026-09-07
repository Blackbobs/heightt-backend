# Fresher dues: frontend integration

## Audience rule

Dues now have a persisted boolean `isFresher`:

| Value | Eligible students |
| --- | --- |
| `true` | Exactly 100 level |
| `false` | 200 level and above |
| Omitted during creation | Defaults to `false` |

The backend uses `studentProfile.currentAcademicLevel.numericLevel`, not the level's display name, admission year, or organization scope. Students without a current academic level, or with a numeric level below 200 other than 100, receive no student dues and cannot initiate due payments.

The existing organization membership, active due status, and academic-session rules still apply alongside the audience rule. There is no “all levels” value.

## Create a due

`POST /api/v1/finance/dues`

Use existing authentication and permissions. Add `isFresher` to the JSON request:

```json
{
  "organizationId": "cmt0voucd000tljtv2ahkkkap",
  "name": "100 Level Departmental Dues",
  "description": "Departmental dues for freshers",
  "amount": 500000,
  "isRequired": true,
  "isFresher": true,
  "status": "ACTIVE"
}
```

`amount` remains in kobo; `500000` is NGN 5,000. Optional `sessionId` continues to work as before.

Send JSON booleans: `true` or `false`. Strings such as `"true"`, `"false"`, and numeric values such as `1` fail DTO validation with HTTP 400. Do not send `null`; omit the property to use the default.

Suggested form control:

- Label: **Due audience**
- Options: **100 level students** (`true`), **200 level and above** (`false`)
- Default: **200 level and above**

```ts
type DueAudienceFields = { isFresher: boolean };
type CreateDueAudienceFields = { isFresher?: boolean };

const payload = {
  ...formValues,
  isFresher: selectedAudience === '100_LEVEL',
};
```

The returned due object includes `isFresher`. Add it to the existing frontend Due type. This change adds creation support; it does not add an update-due endpoint.

## Read dues

### Admin list

`GET /api/v1/finance/dues`

The existing paginated response remains unchanged except that each due in `data` includes `isFresher`. Admins continue to see both audiences. Display an audience column or badge:

```ts
const audienceLabel = due.isFresher
  ? '100 level students'
  : '200 level and above';
```

### Authenticated student list

`GET /api/v1/finance/dues/student`

No new request parameter is needed. The backend reads the authenticated student's current level. Render the returned list directly.

Each item keeps its existing shape, including `dueId`, `isAutoAssigned`, `sessionCategory`, `isArrear`, and `canPay`. The new field is nested at **`item.due.isFresher`**, not at the assignment's top level:

```ts
// Selected fields from a student due item:
const item = {
  id: 'due_due-id',
  dueId: 'due-id',
  isAutoAssigned: true,
  canPay: true,
  due: {
    id: 'due-id',
    name: '100 Level Departmental Dues',
    amount: 500000,
    isFresher: true,
  },
};
```

Filtering applies to both unassigned dues and existing assignments, including unpaid previous-session assignments. After promotion from 100 to 200 level, fresher assignments no longer appear in this list and cannot be paid through the due-payment initiation paths. Existing assignments and payment records are retained; this feature does not delete financial history. Previous-session arrears remain visible only when their audience matches the student's current level.

Use an empty state such as “No dues available for your level.” If the profile has no level, direct the student to complete their academic profile.

The student dues endpoint has an existing 120-second server cache. A level change can take up to that long to appear in the list; payment eligibility is checked against the current database level.

## Assignment and payments

`POST /api/v1/finance/dues/:id/assign` retains its request shape. Explicit student IDs, department selections, and level selections are restricted to eligible students. Ineligible IDs are skipped. If no eligible students remain, the response is HTTP 400 with `No students found to assign due`. Use the returned assignment count rather than the number selected in the UI.

Payment payloads remain unchanged:

```ts
const paymentInput = item.isAutoAssigned
  ? { dueId: item.dueId }
  : { dueAssignmentId: item.id };
```

The backend checks eligibility for both IDs, including direct transaction creation. A mismatched or missing academic level produces HTTP 403:

```json
{
  "statusCode": 403,
  "message": "This due is not available for your academic level",
  "error": "Forbidden"
}
```

Continue using the application's existing error handling/envelope. Show the message and refresh the student's dues/profile. Do not retry with another ID to bypass the audience check.

## Guest checkout

`GET /api/v1/guest-payments/options/dues` now accepts `academicLevelId` alongside the existing institution/faculty/department/organization filters:

```text
/api/v1/guest-payments/options/dues?institutionId=<id>&departmentId=<id>&academicLevelId=<id>
```

Choose an academic level before fetching dues. Missing, invalid, mismatched, or unsupported levels return an empty list. Each returned due includes `isFresher`.

Include the selected `academicLevelId` in `POST /api/v1/guest-payments/initiate`. Checkout without a matching level is rejected. Clear the selected due and reload the options whenever the academic level changes. Include `academicLevelId` in the frontend query/cache key.

## Migration and rollout

The migration `20260907120000_add_due_is_fresher` adds a non-null boolean with a database default of `false`. **All existing dues become 200-level-and-above dues.** Review existing dues that should target 100 level and reclassify them through an authorized database maintenance process; no bulk reclassification is performed by this migration.

Deployment must apply the migration before running the updated backend:

```sh
npm run db:deploy
npm run db:generate
npm run build
```

The migration is provided in the repository; it has not been applied to a database as part of this change.

Frontend acceptance checks:

1. Create a fresher due and a non-fresher due in the same organization/session.
2. Confirm a 100-level student sees only the fresher due.
3. Confirm 200-, 300-, and higher-level students see only the non-fresher due.
4. Confirm a student without an academic level sees no dues.
5. Confirm the admin list displays both audiences.
6. Confirm direct payment of a mismatched due or assignment returns 403.
7. Confirm guest options and checkout use the selected academic level.
8. Confirm omitted `isFresher` creates a non-fresher due and string booleans fail validation.

See also [session behavior](student-dues-session-frontend.md), [payment integration](due-payment-frontend-integration.md), and [guest checkout](guest-dues-payments-frontend.md).
