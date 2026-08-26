-- A due assignment belongs to one student and one due. Keeping this unique at
-- the database layer prevents concurrent checkout/webhook requests from
-- recording a second payment for the same student's due.
CREATE UNIQUE INDEX IF NOT EXISTS "due_payments_assignmentId_key"
ON "due_payments"("assignmentId");

-- Prevent two simultaneous requests from opening separate checkout sessions
-- for the same due. Terminal pending-payment rows remain as audit history.
-- Existing duplicates are retained for audit, but only the newest usable
-- checkout remains active. Older rows become CANCELLED before the index is
-- created. This makes the migration safe for databases that predate the rule.
WITH ranked_pending_dues AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "dueAssignmentId"
      ORDER BY
        ("bachsCheckoutId" IS NOT NULL) DESC,
        "createdAt" DESC,
        "id" DESC
    ) AS row_number
  FROM "pending_payments"
  WHERE "status" = 'PENDING'
    AND "dueAssignmentId" IS NOT NULL
)
UPDATE "pending_payments" AS pending
SET
  "status" = 'CANCELLED',
  "updatedAt" = CURRENT_TIMESTAMP,
  "metadata" = COALESCE(pending."metadata", '{}'::jsonb) || jsonb_build_object(
    'cancelledByMigration', true,
    'cancellationReason', 'Duplicate active checkout for due assignment'
  )
FROM ranked_pending_dues AS ranked
WHERE pending."id" = ranked."id"
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "pending_payments_active_due_assignment_key"
ON "pending_payments"("dueAssignmentId")
WHERE "status" = 'PENDING' AND "dueAssignmentId" IS NOT NULL;
