# Due payment frontend integration

All monetary values sent to the API are integer kobo. A due may have only one active external payment attempt at a time.

## API types

```ts
export type PaymentState =
  'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

export type InitiatePaymentResponse = {
  success: true;
  message: string;
  data: {
    checkoutId: string;
    checkoutUrl: string;
    pendingPaymentId: string;
    baseAmount: number;
    platformFee: number;
    totalBeforeGatewayFee: number;
  };
};

export type PendingPaymentStatus = {
  id: string;
  status: PaymentState;
  amount: number;
  reference: string;
  checkoutId: string | null;
  paymentId: string | null;
  receiptId: string | null;
  receiptNumber: string | null;
  retryable: boolean;
  nextAction:
    | 'SHOW_SUCCESS'
    | 'RETRY_PAYMENT'
    | 'RETRY_CHECKOUT_CREATION'
    | 'WAIT_FOR_CONFIRMATION';
  failureReason: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type PaymentConflict = {
  statusCode: 409;
  code: 'PAYMENT_ALREADY_IN_PROGRESS' | 'PAYMENT_STATUS_UNAVAILABLE';
  message: string;
  pendingPaymentId?: string;
  checkoutId?: string;
  statusUrl?: string;
};
```

Depending on the HTTP wrapper, NestJS may expose the conflict fields directly or inside `response.data`/`response.data.message`. Normalise that once in the API client.

## API functions

```ts
type InitiateDuePaymentInput = {
  organizationId: string;
  dueId?: string;
  dueAssignmentId?: string;
  amount: number;
  paymentMethod: string;
};

export async function initiateDuePayment(
  input: InitiateDuePaymentInput,
): Promise<InitiatePaymentResponse> {
  return apiRequest('/api/v1/finance/payments', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      successUrl: `${window.location.origin}/payment/callback`,
      cancelUrl: `${window.location.origin}/payment/cancelled`,
    }),
  });
}

export async function getPendingPaymentStatus(
  pendingPaymentId: string,
): Promise<PendingPaymentStatus> {
  const response = await apiRequest(
    `/api/v1/finance/payments/pending/${encodeURIComponent(pendingPaymentId)}/status`,
    { method: 'GET', cache: 'no-store' },
  );
  return response.data;
}
```

The configured callback origins must be allowed by the backend's `PAYMENT_REDIRECT_ORIGINS` setting.

## Starting or retrying a payment

```ts
export async function startDuePayment(input: InitiateDuePaymentInput) {
  try {
    const response = await initiateDuePayment(input);
    sessionStorage.setItem(
      `heightt:due-payment:${input.dueAssignmentId || input.dueId}`,
      response.data.pendingPaymentId,
    );
    window.location.assign(response.data.checkoutUrl);
  } catch (rawError) {
    const error = normaliseApiError(rawError) as PaymentConflict;

    if (
      error.statusCode === 409 &&
      error.pendingPaymentId &&
      (error.code === 'PAYMENT_ALREADY_IN_PROGRESS' ||
        error.code === 'PAYMENT_STATUS_UNAVAILABLE')
    ) {
      return { kind: 'CHECK_STATUS' as const, id: error.pendingPaymentId };
    }

    throw rawError;
  }
}
```

Do not show a dead-end toast for HTTP 409. If the response contains `pendingPaymentId`, open the payment-status UI and call the status endpoint. If an existing checkout is still open, the initiation endpoint normally returns its checkout URL as a successful response and the browser can redirect to it again.

If a legacy 409 response has no `pendingPaymentId`, refresh the due list and let the user retry. The backend will expire attempts older than 60 minutes during initiation.

## Callback page

The backend appends `payment=<pendingPaymentId>` to both callback URLs. Do not treat arrival on the success URL as proof of payment.

```tsx
import { useQuery } from '@tanstack/react-query';

export function PaymentCallbackPage() {
  const paymentId = new URLSearchParams(window.location.search).get('payment');

  const query = useQuery({
    queryKey: ['pending-payment', paymentId],
    queryFn: () => getPendingPaymentStatus(paymentId!),
    enabled: Boolean(paymentId),
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING' || status === 'PROCESSING' ? 5_000 : false;
    },
    refetchIntervalInBackground: false,
  });

  if (!paymentId) return <p>Payment reference is missing.</p>;
  if (query.isPending) return <p>Checking your payment…</p>;
  if (query.isError) return <p>We could not check this payment. Try again.</p>;

  const payment = query.data!;
  if (payment.status === 'COMPLETED') {
    return <PaymentSuccess receiptId={payment.receiptId} />;
  }
  if (payment.retryable) {
    return <PaymentRetryPanel payment={payment} />;
  }
  return <PaymentProcessing reference={payment.reference} />;
}
```

Stop polling on `COMPLETED`, `FAILED`, `EXPIRED`, or `CANCELLED`. Invalidate the due, payment-history, wallet, and receipt queries after completion.

## UI state rules

| State        | Message                                             | Primary action                       |
| ------------ | --------------------------------------------------- | ------------------------------------ |
| `PENDING`    | Checkout creation was interrupted.                  | Call the initiation endpoint again.  |
| `PROCESSING` | Payment is awaiting provider confirmation.          | Keep polling; provide “Check again”. |
| `COMPLETED`  | Payment confirmed.                                  | Show receipt or return to dues.      |
| `FAILED`     | Payment failed. No successful payment was recorded. | Start a new payment attempt.         |
| `EXPIRED`    | The checkout expired.                               | Start a new payment attempt.         |
| `CANCELLED`  | The checkout was cancelled.                         | Start a new payment attempt.         |

Disable the Pay button only while the initiation request itself is submitting. Do not leave it permanently disabled merely because a previous attempt exists. While status is `PROCESSING`, show a status panel instead of silently doing nothing.

Never mark a due paid locally. The due is paid only when the status endpoint returns `COMPLETED` or a refreshed due assignment reports `isPaid: true`.

## Recommended query invalidation

```ts
await Promise.all([
  queryClient.invalidateQueries({ queryKey: ['dues'] }),
  queryClient.invalidateQueries({ queryKey: ['due-assignments'] }),
  queryClient.invalidateQueries({ queryKey: ['payments'] }),
  queryClient.invalidateQueries({ queryKey: ['receipts'] }),
  queryClient.invalidateQueries({ queryKey: ['wallet'] }),
]);
```

Do not call the Bachs API directly from the browser. Heightt's backend owns reconciliation and validates that the pending payment belongs to the authenticated user.
