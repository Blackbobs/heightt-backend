ALTER TABLE "dues"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedBy" TEXT;

ALTER TABLE "bank_accounts"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedBy" TEXT;

CREATE INDEX "dues_deletedAt_idx" ON "dues"("deletedAt");
CREATE INDEX "bank_accounts_userId_deletedAt_idx"
ON "bank_accounts"("userId", "deletedAt");
