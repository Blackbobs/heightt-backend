/*
  Warnings:

  - You are about to alter the column `amount` on the `due_assignments` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `amount` on the `due_payments` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `amount` on the `dues` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `lateFee` on the `dues` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `price` on the `events` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `balance` on the `ledger_accounts` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `amount` on the `ledger_entries` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `balanceBefore` on the `ledger_entries` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `balanceAfter` on the `ledger_entries` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `amount` on the `payments` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `serviceFee` on the `payments` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `amount` on the `refunds` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `targetAmount` on the `savings_goals` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `currentAmount` on the `savings_goals` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `amount` on the `savings_transactions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `amount` on the `settlements` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `amount` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `fee` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `netAmount` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `amount` on the `wallet_holds` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `balance` on the `wallets` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `heldBalance` on the `wallets` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `amount` on the `withdrawals` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - Added the required column `createdBy` to the `events` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_organizationId_fkey";

-- AlterTable
ALTER TABLE "due_assignments" ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "due_payments" ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "dues" ALTER COLUMN "amount" SET DATA TYPE INTEGER,
ALTER COLUMN "lateFee" SET DEFAULT 0,
ALTER COLUMN "lateFee" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "createdBy" TEXT NOT NULL,
ADD COLUMN     "isApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rejectionReason" TEXT,
ALTER COLUMN "organizationId" DROP NOT NULL,
ALTER COLUMN "price" SET DEFAULT 0,
ALTER COLUMN "price" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "ledger_accounts" ALTER COLUMN "balance" SET DEFAULT 0,
ALTER COLUMN "balance" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "ledger_entries" ALTER COLUMN "amount" SET DATA TYPE INTEGER,
ALTER COLUMN "balanceBefore" SET DATA TYPE INTEGER,
ALTER COLUMN "balanceAfter" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "amount" SET DATA TYPE INTEGER,
ALTER COLUMN "serviceFee" SET DEFAULT 0,
ALTER COLUMN "serviceFee" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "refunds" ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "savings_goals" ALTER COLUMN "targetAmount" SET DATA TYPE INTEGER,
ALTER COLUMN "currentAmount" SET DEFAULT 0,
ALTER COLUMN "currentAmount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "savings_transactions" ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "settlements" ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "amount" SET DATA TYPE INTEGER,
ALTER COLUMN "fee" SET DEFAULT 0,
ALTER COLUMN "fee" SET DATA TYPE INTEGER,
ALTER COLUMN "netAmount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "wallet_holds" ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "wallets" ALTER COLUMN "balance" SET DEFAULT 0,
ALTER COLUMN "balance" SET DATA TYPE INTEGER,
ALTER COLUMN "heldBalance" SET DEFAULT 0,
ALTER COLUMN "heldBalance" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "withdrawals" ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- CreateIndex
CREATE INDEX "events_createdBy_idx" ON "events"("createdBy");

-- CreateIndex
CREATE INDEX "events_isPublic_idx" ON "events"("isPublic");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
