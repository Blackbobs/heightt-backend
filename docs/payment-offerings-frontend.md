# Organization payment offerings

Payment offerings collect organization contributions that are not dues. Amounts use kobo.

## Admin dashboard

Create an offering:

```http
POST /api/v1/finance/payment-offerings
Authorization: Bearer <admin-token>
```

```json
{
  "organizationId": "<organization-id>",
  "sessionId": "<current-session-id>",
  "name": "Department event contribution",
  "description": "Contribution for the annual department event",
  "amount": 500000,
  "status": "ACTIVE"
}
```

The session is optional. When set, it must belong to the organization's institution.
An active offering is visible to active student members of its organization when it
has no session or belongs to the student's current institution session.

List organization offerings and completed student counts:

```http
GET /api/v1/finance/payment-offerings?organizationId=<id>&academicSessionId=<id>
Authorization: Bearer <admin-token>
```

Each offering includes `paidStudentCount`, counted from completed payments. The
admin dashboard should show this count beside the offering amount and status.

## Student app

Load active offerings:

```http
GET /api/v1/finance/payment-offerings/student
Authorization: Bearer <student-token>
```

Each item includes `isPaid` and `isPending`. Show the offering name, description,
organization, session, base amount, and 3% Heightt fee. The fee is added to the
student checkout total and rounded to the nearest kobo.

Start checkout using the offering ID and server-provided amount:

```http
POST /api/v1/finance/payments
Authorization: Bearer <student-token>
```

```json
{
  "paymentOfferingId": "<payment-offering-id>",
  "organizationId": "<organization-id>",
  "amount": 500000,
  "paymentMethod": "CARD",
  "successUrl": "https://app.example.com/payment/callback",
  "cancelUrl": "https://app.example.com/payment/cancelled"
}
```

The backend verifies active offering status, student membership, organization,
and exact amount. A student cannot complete the same offering more than once.
An existing pending checkout is reused where possible.

Due checkouts keep the existing fixed ₦100 Heightt fee. Non-due checkouts use 3%.
