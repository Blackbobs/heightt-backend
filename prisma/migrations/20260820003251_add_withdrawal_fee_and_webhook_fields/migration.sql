/*
  Warnings:

  - A unique constraint covering the columns `[webhookId]` on the table `withdrawals` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "wallets_isPlatformWallet_key";

-- AlterTable
ALTER TABLE "withdrawals" ADD COLUMN     "fee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "netAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "webhookAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "webhookCompletedAt" TIMESTAMP(3),
ADD COLUMN     "webhookId" TEXT,
ADD COLUMN     "webhookResponse" JSONB,
ADD COLUMN     "webhookStatus" TEXT DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "withdrawal_webhooks" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "provider" TEXT,
    "providerReference" TEXT,
    "response" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "withdrawal_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "bankCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_webhooks_withdrawalId_key" ON "withdrawal_webhooks"("withdrawalId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_userId_accountNumber_bankName_key" ON "bank_accounts"("userId", "accountNumber", "bankName");

-- CreateIndex
CREATE INDEX "wallets_isPlatformWallet_idx" ON "wallets"("isPlatformWallet");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_webhookId_key" ON "withdrawals"("webhookId");

-- CreateIndex
CREATE INDEX "withdrawals_webhookStatus_idx" ON "withdrawals"("webhookStatus");

-- AddForeignKey
ALTER TABLE "withdrawal_webhooks" ADD CONSTRAINT "withdrawal_webhooks_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "withdrawals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
