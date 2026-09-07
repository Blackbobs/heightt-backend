# Soft deletion of sensitive financial data

## Scope

Heightt preserves business and audit records instead of physically removing them. User accounts already use soft deletion, and organizations already have deletion metadata in the schema. This change extends soft-delete behavior to dues and bank accounts, the remaining records exposed through destructive finance endpoints.

Payments, transactions, receipts, refunds, withdrawals, journal entries, ledger lines, guest payer records, and audit logs have no application delete endpoint and remain immutable. Short-lived verification/reset tokens and replaceable relationship rows can still be physically removed as part of their normal lifecycle.

Soft deletion supports traceability and recovery, but it does not by itself establish compliance with a specific law. The organization still needs an approved retention schedule, lawful-basis policy, access controls, backup-expiry rules, and a process for legally required erasure or anonymization.

## Stored metadata

The `dues` and `bank_accounts` tables now include:

```ts
deletedAt: Date | null;
deletedBy: string | null;
```

`deletedAt = null` means active. A non-null value means deleted. `deletedBy` contains the authenticated actor's user ID.

## API behavior

Existing endpoint paths and success response messages do not change:

```http
DELETE /api/v1/finance/dues/:id
DELETE /api/v1/finance/bank-accounts/:id
```

Deleting a due sets `status` to `CANCELLED`, sets both deletion fields, and creates the existing `DUE_DELETED` activity. The existing restriction still prevents deletion once payment activity exists.

Deleting a bank account clears its default flag, sets both deletion fields, and creates a `BANK_ACCOUNT_DELETED` activity containing only the internal bank-account ID. The activity log deliberately excludes account number and account name.

Normal due and bank-account reads exclude records where `deletedAt` is set. Direct operations against a deleted record return the same not-found response as an unknown ID, which avoids exposing deleted records through the public API.

If the default bank account is deleted, another active account becomes the default. Re-adding the same verified bank account restores the retained row, clears its deletion metadata and stale payout-destination identifiers, and keeps database uniqueness intact.

Historical payment, assignment, receipt, and ledger relations remain stored. A deleted due cannot be newly assigned or paid because normal lookup excludes it and its status becomes `CANCELLED`.

## Frontend behavior

No payload changes are required. After a successful delete, invalidate the relevant lists and remove the record from the visible UI:

```ts
queryClient.invalidateQueries({ queryKey: ['dues'] });
queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
```

Use “Remove” or “Delete” in the UI according to existing product language. Do not claim that historical financial data was permanently erased. A suitable confirmation for bank accounts is: “This bank account will be removed from your payout options. Financial audit records will be retained.”

## Migration and rollout

Apply the migration before starting the updated application:

```sh
npm run db:deploy
npm run db:generate
npm run build
```

The migration only adds nullable columns and indexes. Existing records remain active because their `deletedAt` value is null. The migration is included in the repository and is not applied automatically by this change.

## Operational access

Application endpoints do not expose deleted rows or provide hard-delete operations. Compliance or incident-response access to retained rows should use a separately authorized administrative process with audit logging. Permanent purge or anonymization should be implemented only after retention periods, legal holds, backups, and referential integrity have been defined.
