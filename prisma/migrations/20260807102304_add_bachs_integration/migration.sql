/*
  Warnings:

  - A unique constraint covering the columns `[bachsChargeId]` on the table `payments` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PendingPaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "bachsChargeId" TEXT,
ADD COLUMN     "bachsCheckoutId" TEXT,
ADD COLUMN     "bachsCustomerId" TEXT;

-- CreateTable
CREATE TABLE "pending_payments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "description" TEXT,
    "dueAssignmentId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "reference" TEXT NOT NULL,
    "status" "PendingPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "bachsCheckoutId" TEXT,
    "bachsCustomerId" TEXT,
    "bachsChargeId" TEXT,
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_payments_reference_key" ON "pending_payments"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "pending_payments_bachsCheckoutId_key" ON "pending_payments"("bachsCheckoutId");

-- CreateIndex
CREATE INDEX "pending_payments_userId_idx" ON "pending_payments"("userId");

-- CreateIndex
CREATE INDEX "pending_payments_organizationId_idx" ON "pending_payments"("organizationId");

-- CreateIndex
CREATE INDEX "pending_payments_status_idx" ON "pending_payments"("status");

-- CreateIndex
CREATE INDEX "pending_payments_bachsCheckoutId_idx" ON "pending_payments"("bachsCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_bachsChargeId_key" ON "payments"("bachsChargeId");

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_dueAssignmentId_fkey" FOREIGN KEY ("dueAssignmentId") REFERENCES "due_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
