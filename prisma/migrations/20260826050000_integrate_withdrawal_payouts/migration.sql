ALTER TABLE "bank_accounts"
ADD COLUMN "payoutDestinationId" TEXT,
ADD COLUMN "payoutDestinationStatus" TEXT;

ALTER TABLE "withdrawals"
ADD COLUMN "providerPayoutId" TEXT;

CREATE UNIQUE INDEX "bank_accounts_payoutDestinationId_key"
ON "bank_accounts"("payoutDestinationId");

CREATE UNIQUE INDEX "withdrawals_providerPayoutId_key"
ON "withdrawals"("providerPayoutId");
