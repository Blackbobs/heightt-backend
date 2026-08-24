/*
  Warnings:

  - You are about to drop the `wallets` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId,adminType,institutionId,facultyId,departmentId,organizationId,academicSessionId]` on the table `admins` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[institutionId,slug,academicSessionId]` on the table `organizations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "academic_sessions" DROP CONSTRAINT "academic_sessions_academicLevelId_fkey";

-- DropForeignKey
ALTER TABLE "academic_sessions" DROP CONSTRAINT "academic_sessions_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "academic_sessions" DROP CONSTRAINT "academic_sessions_facultyId_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_walletId_fkey";

-- DropForeignKey
ALTER TABLE "wallet_holds" DROP CONSTRAINT "wallet_holds_walletId_fkey";

-- DropForeignKey
ALTER TABLE "wallets" DROP CONSTRAINT "wallets_ledgerAccountId_fkey";

-- DropForeignKey
ALTER TABLE "wallets" DROP CONSTRAINT "wallets_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "wallets" DROP CONSTRAINT "wallets_userId_fkey";

-- DropForeignKey
ALTER TABLE "withdrawals" DROP CONSTRAINT "withdrawals_walletId_fkey";

-- DropIndex
DROP INDEX "admins_userId_adminType_institutionId_facultyId_departmentI_key";

-- DropIndex
DROP INDEX "organizations_institutionId_slug_key";

-- DropIndex
DROP INDEX "organizations_slug_key";

-- AlterTable
ALTER TABLE "admins" ADD COLUMN     "academicSessionId" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "academicSessionId" TEXT;

-- DropTable
DROP TABLE "wallets";

-- CreateTable
CREATE TABLE "organization_join_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "membershipType" "MembershipType" NOT NULL DEFAULT 'STUDENT',
    "message" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "isPlatformWallet" BOOLEAN NOT NULL DEFAULT false,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "heldBalance" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "ledgerAccountId" TEXT,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_join_requests_organizationId_status_idx" ON "organization_join_requests"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_join_requests_organizationId_userId_key" ON "organization_join_requests"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_organizationId_key" ON "Wallet"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_ledgerAccountId_key" ON "Wallet"("ledgerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_isPlatformWallet_key" ON "Wallet"("isPlatformWallet");

-- CreateIndex
CREATE UNIQUE INDEX "admins_userId_adminType_institutionId_facultyId_departmentI_key" ON "admins"("userId", "adminType", "institutionId", "facultyId", "departmentId", "organizationId", "academicSessionId");

-- CreateIndex
CREATE INDEX "organizations_academicSessionId_idx" ON "organizations"("academicSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_institutionId_slug_academicSessionId_key" ON "organizations"("institutionId", "slug", "academicSessionId");

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_academicLevelId_fkey" FOREIGN KEY ("academicLevelId") REFERENCES "academic_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "academic_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_join_requests" ADD CONSTRAINT "organization_join_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_join_requests" ADD CONSTRAINT "organization_join_requests_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_join_requests" ADD CONSTRAINT "organization_join_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "academic_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
