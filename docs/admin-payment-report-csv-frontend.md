# Admin payment report CSV — frontend integration

The backend exposes one CSV download endpoint for both platform and organization admin dashboards:

```http
GET /api/v1/finance/reports/payments.csv
```

The request must use the dashboard's authenticated admin session and the admin must have the `finance:export` permission.

## Access and scope

- A platform admin can export payments across the platform or pass `organizationId` to export one organization.
- An organization admin can only export payments for an organization assigned to that admin. The backend enforces this restriction; do not rely on the UI for authorization.
- Other admin types are rejected by this endpoint.

Organization admins receive `finance:export` by default after the permission defaults are synchronized. For existing deployments, run:

```bash
npm run db:sync-admin-permissions
```

## Query parameters

All parameters are optional.

| Parameter | Meaning | Example |
| --- | --- | --- |
| `organizationId` | Limit the report to one organization | `cm123...` |
| `status` | Payment status | `COMPLETED` |
| `payerId` | Limit the report to one payer | `cm456...` |
| `startDate` | Include payments created on/after this ISO timestamp | `2026-09-01T00:00:00.000Z` |
| `endDate` | Include payments created on/before this ISO timestamp | `2026-09-30T23:59:59.999Z` |

The dates must be valid ISO dates and `startDate` cannot be later than `endDate`.

## Browser implementation

Use `fetch` and read the response as a `Blob`. Do not parse the response as JSON.

```ts
type PaymentReportFilters = {
  organizationId?: string;
  status?: string;
  payerId?: string;
  startDate?: string;
  endDate?: string;
};

export async function downloadPaymentReport(
  filters: PaymentReportFilters = {},
) {
  const query = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });

  const suffix = query.size ? `?${query.toString()}` : '';
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/finance/reports/payments.csv${suffix}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'text/csv' },
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || 'Unable to generate payment report');
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const filename =
    disposition.match(/filename="([^"]+)"/)?.[1] || 'payment-report.csv';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
```

If the frontend authenticates with a bearer token instead of the dashboard cookies, replace `credentials: 'include'` with the existing `Authorization: Bearer <token>` header. Keep the platform and organization dashboard authentication clients isolated, as with other admin API calls.

## React button example

```tsx
function ExportPaymentsButton({ organizationId }: { organizationId?: string }) {
  const [downloading, setDownloading] = useState(false);

  async function handleExport() {
    try {
      setDownloading(true);
      await downloadPaymentReport({ organizationId, status: 'COMPLETED' });
    } catch (error) {
      // Replace this with the application's toast/error component.
      console.error(error);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button type="button" onClick={handleExport} disabled={downloading}>
      {downloading ? 'Generating…' : 'Export CSV'}
    </button>
  );
}
```

For an organization dashboard, pass the active organization's ID. For the platform-wide report, omit it.

## Response

On success the endpoint responds with:

```http
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="payment-report-<scope>-YYYY-MM-DD.csv"
Cache-Control: private, no-store
```

The CSV includes payment/reference identifiers, status, amounts in kobo and NGN, fees, method, payer details, organization details, due and receipt references, and payment timestamps. It includes a UTF-8 byte-order mark for Excel compatibility and neutralizes spreadsheet-formula prefixes in data fields.

Expected errors:

- `400`: invalid date range.
- `401`: admin session is missing or expired.
- `403`: wrong admin type, missing `finance:export`, or organization outside the admin's scope.
