-- AlterTable
ALTER TABLE "ledger_accounts" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "metadata" JSONB;
