/*
  Warnings:

  - A unique constraint covering the columns `[walletId]` on the table `ledger_accounts` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ownerType,ownerId,code]` on the table `ledger_accounts` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[journalEntryId]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[journalEntryId]` on the table `refunds` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[journalEntryId]` on the table `transactions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ledgerAccountId]` on the table `wallets` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[journalEntryId]` on the table `withdrawals` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "LedgerAccountCategory" AS ENUM ('CASH', 'BANK', 'RECEIVABLE', 'PAYABLE', 'REVENUE', 'EXPENSE', 'EQUITY', 'ESCROW', 'SETTLEMENT', 'PLATFORM_FEE', 'TAX');

-- CreateEnum
CREATE TYPE "LedgerAccountOwnerType" AS ENUM ('USER', 'ORGANIZATION', 'PLATFORM', 'SYSTEM');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED', 'VOIDED');

-- CreateEnum
CREATE TYPE "JournalLineType" AS ENUM ('DEBIT', 'CREDIT');

-- AlterTable
ALTER TABLE "ledger_accounts" ADD COLUMN     "category" "LedgerAccountCategory",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "ownerType" "LedgerAccountOwnerType" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "pendingBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "walletId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "journalEntryId" TEXT;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "journalEntryId" TEXT;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "journalEntryId" TEXT;

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "ledgerAccountId" TEXT;

-- AlterTable
ALTER TABLE "withdrawals" ADD COLUMN     "journalEntryId" TEXT;

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT,
    "transactionId" TEXT,
    "paymentId" TEXT,
    "withdrawalId" TEXT,
    "refundId" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'POSTED',
    "isBalanced" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "type" "JournalLineType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reference_key" ON "journal_entries"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_transactionId_key" ON "journal_entries"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_paymentId_key" ON "journal_entries"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_withdrawalId_key" ON "journal_entries"("withdrawalId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_refundId_key" ON "journal_entries"("refundId");

-- CreateIndex
CREATE INDEX "journal_entries_reference_idx" ON "journal_entries"("reference");

-- CreateIndex
CREATE INDEX "journal_entries_transactionId_idx" ON "journal_entries"("transactionId");

-- CreateIndex
CREATE INDEX "journal_entries_paymentId_idx" ON "journal_entries"("paymentId");

-- CreateIndex
CREATE INDEX "journal_entries_entryDate_idx" ON "journal_entries"("entryDate");

-- CreateIndex
CREATE INDEX "journal_entries_status_idx" ON "journal_entries"("status");

-- CreateIndex
CREATE INDEX "journal_lines_journalEntryId_idx" ON "journal_lines"("journalEntryId");

-- CreateIndex
CREATE INDEX "journal_lines_ledgerAccountId_idx" ON "journal_lines"("ledgerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_walletId_key" ON "ledger_accounts"("walletId");

-- CreateIndex
CREATE INDEX "ledger_accounts_type_idx" ON "ledger_accounts"("type");

-- CreateIndex
CREATE INDEX "ledger_accounts_ownerType_idx" ON "ledger_accounts"("ownerType");

-- CreateIndex
CREATE INDEX "ledger_accounts_ownerId_idx" ON "ledger_accounts"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_ownerType_ownerId_code_key" ON "ledger_accounts"("ownerType", "ownerId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "payments_journalEntryId_key" ON "payments"("journalEntryId");

-- CreateIndex
CREATE INDEX "payments_journalEntryId_idx" ON "payments"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_journalEntryId_key" ON "refunds"("journalEntryId");

-- CreateIndex
CREATE INDEX "refunds_journalEntryId_idx" ON "refunds"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_journalEntryId_key" ON "transactions"("journalEntryId");

-- CreateIndex
CREATE INDEX "transactions_journalEntryId_idx" ON "transactions"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_ledgerAccountId_key" ON "wallets"("ledgerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_journalEntryId_key" ON "withdrawals"("journalEntryId");

-- CreateIndex
CREATE INDEX "withdrawals_journalEntryId_idx" ON "withdrawals"("journalEntryId");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
