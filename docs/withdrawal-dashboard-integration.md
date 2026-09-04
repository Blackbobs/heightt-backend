# Withdrawal dashboard integration

This guide covers user, organisation, and platform withdrawals, including payouts that remain processing while the provider completes them.

## Backend behaviour

Withdrawal status is one of:

```ts
export type WithdrawalStatus =
  'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
```

- `PENDING`: waiting for the required approval step.
- `PROCESSING`: accepted and submitted to the payout provider.
- `COMPLETED`: confirmed paid by a verified webhook or provider reconciliation.
- `FAILED`: provider failure confirmed; the backend runs its compensation/refund path.
- `CANCELLED`: cancelled before completion.

The backend now has two completion paths:

1. A verified provider webhook updates the withdrawal immediately.
2. Every 10 minutes, stale processing withdrawals are reconciled against Bachs. A withdrawal becomes eligible for reconciliation after five minutes in `PROCESSING`.

Do not treat `PROCESSING` as a failure. Bank payout rails can remain asynchronous for some time.

## Frontend type

```ts
export type Withdrawal = {
  id: string;
  userId: string;
  walletId: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: WithdrawalStatus;
  bankName: string;
  accountNumber: string;
  accountName: string;
  reference: string;
  providerPayoutId?: string | null;
  requestedAt: string;
  processedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  webhookStatus?: string | null;
};

export type WithdrawalListResponse = {
  data: Withdrawal[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
```

## Platform earnings

Organization and platform withdrawals do not incur a Heightt withdrawal charge. They reserve Bachs' fixed ₦100 payout fee (10,000 kobo) in addition to the requested principal.

`GET /api/v1/finance/reports/overview` returns:

```ts
export type PlatformEarnings = {
  // Net earnings remaining after processing/completed platform withdrawals
  // and any external payout-provider fees.
  amount: number;
  amountFormatted: string;
  // Lifetime Heightt service-fee earnings before withdrawals.
  grossAmount: number;
  grossAmountFormatted: string;
  // Platform payout principal already processing or completed.
  withdrawnAmount: number;
  withdrawnAmountFormatted: string;
  // External provider fees, not an additional Heightt fee.
  payoutProviderFees: number;
  payoutProviderFeesFormatted: string;
  withdrawalCount: number;
  currency: 'NGN';
  currencyUnit: 'KOBO';
  scope: 'PLATFORM_NET' | 'INSTITUTION_GROSS';
};
```

For the platform-wide dashboard, call the overview endpoint without `institutionId`. Display:

- Available platform earnings: `platformEarnings.amountFormatted`
- Gross earnings: `platformEarnings.grossAmountFormatted`
- Withdrawn or in transit: `platformEarnings.withdrawnAmountFormatted`
- Provider payout fees: `platformEarnings.payoutProviderFeesFormatted`

Do not subtract withdrawals again on the frontend. The `amount` field is already net of processing and completed platform withdrawals. A processing platform withdrawal appears immediately, preventing the dashboard from temporarily overstating available earnings.

## Available balance and withdrawal limits

Before showing or submitting the withdrawal form, request a backend quote:

```http
GET /api/v1/finance/withdrawals/quote?type=ORGANIZATION&organizationId=org_id
GET /api/v1/finance/withdrawals/quote?type=PLATFORM
```

Add `amount` in kobo to preview the exact fee and total debit:

```http
GET /api/v1/finance/withdrawals/quote?type=ORGANIZATION&organizationId=org_id&amount=190000
```

```ts
export type WithdrawalQuote = {
  balance: number;
  heldBalance: number;
  availableBalance: number;
  requestedAmount: number | null;
  fee: number;
  totalDebit: number;
  maxWithdrawable: number;
  canWithdraw: boolean;
  feePolicy: 'WITHDRAWAL_FEE_APPLIES' | 'PROVIDER_FEE_ONLY';
  platformFee: number;
  providerFee: number;
  currency: 'NGN';
  currencyUnit: 'KOBO';
};
```

`availableBalance` excludes funds already held by pending or processing withdrawals. `maxWithdrawable` is the largest principal the backend will accept:

- For organisation and platform withdrawals, `maxWithdrawable` is `availableBalance` minus Bachs' fixed ₦100 provider fee. Heightt's platform fee is zero.

Use `maxWithdrawable` for the input's maximum and disable submission when `canWithdraw` is false. Show Available balance, Withdrawal amount, Fee, and Total debit as separate rows. Amounts are integers in kobo; do not use floating-point naira values in API requests.

```ts
export async function getWithdrawalQuote(input: {
  type: 'ORGANIZATION' | 'PLATFORM';
  organizationId?: string;
  amount?: number;
}): Promise<WithdrawalQuote> {
  const params = new URLSearchParams({ type: input.type });
  if (input.organizationId) params.set('organizationId', input.organizationId);
  if (input.amount !== undefined) params.set('amount', String(input.amount));
  return apiRequest(`/api/v1/finance/withdrawals/quote?${params}`, {
    method: 'GET',
    cache: 'no-store',
  });
}
```

The quote is a user-interface aid, not an authorisation guarantee. The server locks and rechecks the wallet when the withdrawal is submitted, preventing concurrent requests from reserving the same funds. If the balance changed, the API responds with HTTP 400 and:

```ts
type InsufficientBalanceError = {
  code: 'INSUFFICIENT_AVAILABLE_BALANCE';
  message: string;
  availableBalance: number;
  requestedAmount: number;
  fee: number;
  totalDebit: number;
  maxWithdrawable: number;
  currency: 'NGN';
  currencyUnit: 'KOBO';
};
```

Refresh the quote and display “Your available balance changed. The maximum you can now withdraw is {formatted maxWithdrawable}.” Never override this response or retry the same amount automatically.

Amounts are returned in kobo. Format them at the display boundary:

```ts
export function formatNaira(amountInKobo: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(amountInKobo / 100);
}
```

## API functions

These examples assume an authenticated `apiRequest` helper that sends cookies and handles CSRF for state-changing requests.

```ts
export async function getWithdrawal(id: string): Promise<Withdrawal> {
  return apiRequest(`/api/v1/finance/withdrawals/${encodeURIComponent(id)}`, {
    method: 'GET',
    cache: 'no-store',
  });
}

export async function getOrganizationWithdrawals(input: {
  organizationId: string;
  status?: WithdrawalStatus;
  page?: number;
  limit?: number;
}): Promise<WithdrawalListResponse> {
  const params = new URLSearchParams({
    organizationId: input.organizationId,
    type: 'ORGANIZATION',
    page: String(input.page || 1),
    limit: String(input.limit || 20),
  });
  if (input.status) params.set('status', input.status);

  return apiRequest(`/api/v1/finance/withdrawals?${params}`, {
    method: 'GET',
    cache: 'no-store',
  });
}

export async function getPlatformWithdrawalQueue(input: {
  status?: WithdrawalStatus;
  page?: number;
  limit?: number;
}): Promise<WithdrawalListResponse> {
  const params = new URLSearchParams({
    page: String(input.page || 1),
    limit: String(input.limit || 20),
  });
  if (input.status) params.set('status', input.status);

  return apiRequest(`/api/v1/finance/withdrawals/admin?${params}`, {
    method: 'GET',
    cache: 'no-store',
  });
}
```

## Poll a processing withdrawal

Poll the individual withdrawal endpoint while it is `PENDING` or `PROCESSING`. Stop automatically for every terminal status.

React Query example:

```ts
import { useQuery } from '@tanstack/react-query';

export function useWithdrawal(withdrawalId: string) {
  return useQuery({
    queryKey: ['withdrawal', withdrawalId],
    queryFn: () => getWithdrawal(withdrawalId),
    enabled: Boolean(withdrawalId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING' || status === 'PROCESSING' ? 10_000 : false;
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}
```

The frontend polling does not call Bachs directly. It reads Heightt's database while the backend securely handles webhooks and provider reconciliation.

## Status presentation

Do not communicate status using colour alone.

```ts
export const withdrawalStatusCopy: Record<
  WithdrawalStatus,
  { label: string; description: string }
> = {
  PENDING: {
    label: 'Pending approval',
    description: 'This withdrawal is waiting for approval.',
  },
  PROCESSING: {
    label: 'Processing payout',
    description:
      'The payout has been submitted. Heightt will update this status after confirmation from the provider.',
  },
  COMPLETED: {
    label: 'Payout completed',
    description: 'The payout provider confirmed this transfer as completed.',
  },
  FAILED: {
    label: 'Payout failed',
    description: 'The transfer failed. Review the failure reason below.',
  },
  CANCELLED: {
    label: 'Cancelled',
    description: 'This withdrawal was cancelled.',
  },
};
```

Display these timestamps when present:

- Requested: `requestedAt`
- Submitted to provider: `processedAt`
- Completed: `completedAt`
- Failed: `failedAt`

Show `failureReason` only for `FAILED`. Do not display raw webhook payloads or provider secrets.

## Refresh list data after a transition

When polling observes a status change, invalidate all related queries:

```ts
queryClient.invalidateQueries({ queryKey: ['withdrawals'] });
queryClient.invalidateQueries({ queryKey: ['organization-wallet'] });
queryClient.invalidateQueries({ queryKey: ['platform-wallet'] });
queryClient.invalidateQueries({ queryKey: ['finance-overview'] });
```

Use query keys containing the organisation and academic session where applicable:

```ts
['withdrawals', 'organization', organizationId, academicSessionId, filters];
```

## Processing-state component

```tsx
export function WithdrawalStatusPanel({
  withdrawal,
}: {
  withdrawal: Withdrawal;
}) {
  const copy = withdrawalStatusCopy[withdrawal.status];

  return (
    <section aria-live="polite" aria-labelledby="withdrawal-status">
      <p>Withdrawal reference: {withdrawal.reference}</p>
      <h2 id="withdrawal-status">{copy.label}</h2>
      <p>{copy.description}</p>

      {withdrawal.status === 'PROCESSING' && (
        <p>
          This page refreshes automatically. You can safely leave and return
          later.
        </p>
      )}

      {withdrawal.status === 'COMPLETED' && withdrawal.completedAt && (
        <p>
          Completed{' '}
          {new Intl.DateTimeFormat('en-NG', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(withdrawal.completedAt))}
        </p>
      )}

      {withdrawal.status === 'FAILED' && withdrawal.failureReason && (
        <p role="alert">Reason: {withdrawal.failureReason}</p>
      )}
    </section>
  );
}
```

## Important rules

- Do not mark a withdrawal completed based on a successful request response.
- Do not query Bachs from the browser or expose provider API keys.
- Do not continuously poll completed, failed, or cancelled withdrawals.
- Do not automatically resubmit a processing withdrawal; that risks duplicate payouts.
- Offer a manual UI refresh that refetches Heightt's withdrawal endpoint, not a new payout request.
- Use the withdrawal `status` as the source of truth. `webhookStatus` is diagnostic provider metadata and should not drive the main badge.
