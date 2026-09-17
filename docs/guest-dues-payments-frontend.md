# Guest dues payments and account claiming

> Audience filtering update: see [Fresher dues integration](fresher-dues-frontend.md). Current-level eligibility also applies to existing assignments and previous-session arrears. Guest checkout now needs an academic level.

This flow lets a student discover and pay an active due without registering. The payment is held under a non-login guest identity. After registering with the same email and verifying it, the student requests a six-digit email code and claims all matching guest payments, receipts, and due history.

Existing authenticated payment endpoints remain unchanged.

## Public payment journey

All URLs below are under the configured API origin.

### 1. Load academic choices

```http
GET /api/v1/guest-payments/options/institutions
GET /api/v1/guest-payments/options/faculties?institutionId=<id>
GET /api/v1/guest-payments/options/departments?facultyId=<id>
GET /api/v1/guest-payments/options/dues?institutionId=<id>&facultyId=<id>&departmentId=<id>
```

`facultyId`, `departmentId`, and `organizationId` are optional on the dues request. Each due contains its organization, amount in kobo, and academic session. Only active dues in active organizations are returned.

Suggested UI order:

1. Institution
2. Faculty, when applicable
3. Department, when applicable
4. Due
5. Student identity and payment method

### 2. Obtain a CSRF token

Guest mutations use the same browser CSRF protection as the rest of the API:

```http
GET /api/v1/auth/csrf-token
```

Keep `credentials: 'include'` enabled and send the returned token as `X-CSRF-Token` on POST requests.

### 3. Start checkout

```http
POST /api/v1/guest-payments/initiate
Content-Type: application/json
X-CSRF-Token: <token>
```

```json
{
  "email": "student@example.com",
  "firstName": "Ada",
  "lastName": "Okafor",
  "phone": "+2348000000000",
  "matricNumber": "ENG/2026/001",
  "institutionId": "<institution-id>",
  "facultyId": "<faculty-id>",
  "departmentId": "<department-id>",
  "academicLevelId": "<level-id>",
  "dueId": "<due-id>",
  "paymentMethod": "CARD",
  "successUrl": "https://app.example.com/payments/guest/callback",
  "cancelUrl": "https://app.example.com/payments/guest/cancelled"
}
```

The amount is deliberately not accepted from the browser. The backend reads it from the selected due, preventing amount tampering.

The response contains `checkoutUrl`, `pendingPaymentId`, `guestPayerId`, and `accessToken`. Store `pendingPaymentId` and `accessToken` in `sessionStorage`, then redirect to `checkoutUrl`. The access token is shown only once and must not be logged or placed in a URL.

```ts
sessionStorage.setItem(
  `guest-payment:${result.pendingPaymentId}`,
  result.accessToken,
);
window.location.assign(result.checkoutUrl);
```

### 4. Reconcile the callback

The payment provider returns with a `payment` query parameter containing the pending-payment ID.

```http
POST /api/v1/guest-payments/pending/<pendingPaymentId>/status
Content-Type: application/json
X-CSRF-Token: <token>

{ "accessToken": "<one-time returned guest access token>" }
```

Poll with a modest delay while the response is `PENDING` or `PROCESSING`. Stop on `COMPLETED`, `FAILED`, `EXPIRED`, or `CANCELLED`. On completion, the response includes `paymentId`, `receiptId`, and `receiptNumber` when receipt generation has finished. The receipt is also emailed to the guest's real email address.

## Claiming after registration

The student must:

1. Register using the same email used for guest payment.
2. Verify that account email.
3. Preferably finish student onboarding before claiming, so the due assignment can also be marked paid immediately.

Both claim endpoints require the normal authenticated student session.

### Request the code

```http
POST /api/v1/guest-payments/claim/request
X-CSRF-Token: <token>
```

The server sends a six-digit code to the authenticated account email. Responses are intentionally neutral so the endpoint does not disclose whether guest records exist. A code expires after 10 minutes, has a five-attempt limit, and cannot be requested more than once per minute.

### Verify and claim

```http
POST /api/v1/guest-payments/claim/verify
Content-Type: application/json
X-CSRF-Token: <token>

{ "code": "123456" }
```

Example success response:

```json
{
  "claimedGuestRecords": 2,
  "claimedPayments": 2
}
```

Refresh the student's payment history, receipts, and dues after success. The records now belong to the registered user and are available through the existing authenticated endpoints.

## Frontend helper

```ts
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const csrfResponse = await fetch(`${API_URL}/api/v1/auth/csrf-token`, {
    credentials: 'include',
  });
  const { csrfToken } = await csrfResponse.json();
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || 'Request failed');
  }
  return response.json();
}
```

## Admin dashboard

Guest payments appear in the existing scoped endpoint:

```http
GET /api/v1/finance/payments/history/admin
```

Before a claim, `payment.payer.guestPayer` contains:

- Guest name and email
- Phone and matric number
- Selected institution, faculty, department, and academic level IDs
- Claim timestamp, when applicable

Render a `Guest` badge when `payer.guestPayer` is present. After claiming, the payer becomes the registered user; the original `guestName`, `guestEmail`, `guestPhone`, `guestMatricNumber`, `guestDueId`, and `guestPayerId` remain in payment metadata for audit continuity.

The CSV endpoint also includes guest name, email, and matric number:

```http
GET /api/v1/finance/reports/payments.csv
```

Organization admins only see payments within their assigned organization scope. Platform admins can see all guest payments or filter with `organizationId`. The dashboard must not attempt to reproduce these authorization rules client-side; the backend is authoritative.

Recommended admin columns are: payer type, payer name, email, matric number, organization, due, amount, payment status, claim status, reference, paid date, and receipt number.

## Error handling

- `400`: invalid academic selection, invalid/expired claim code, or provider validation failure.
- `401`: claim attempted without an authenticated account.
- `403`: account email is not verified or the guest status token is invalid.
- `404`: selected due no longer exists or is inactive.
- `429`: claim code requested too frequently.

Never expose the synthetic placeholder user's email or username in the student UI. Use the guest identity fields returned by the API.
