-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('ISSUED', 'VOIDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "serviceFee" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "payerName" TEXT NOT NULL,
    "payerEmail" TEXT NOT NULL,
    "payerPhone" TEXT,
    "paymentMethod" "PaymentMethodType" NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "organizationName" TEXT,
    "organizationSlug" TEXT,
    "metadata" JSONB,
    "items" JSONB,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'ISSUED',
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloaded" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipts_paymentId_key" ON "receipts"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receiptNumber_key" ON "receipts"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_reference_key" ON "receipts"("reference");

-- CreateIndex
CREATE INDEX "receipts_paymentId_idx" ON "receipts"("paymentId");

-- CreateIndex
CREATE INDEX "receipts_userId_idx" ON "receipts"("userId");

-- CreateIndex
CREATE INDEX "receipts_organizationId_idx" ON "receipts"("organizationId");

-- CreateIndex
CREATE INDEX "receipts_receiptNumber_idx" ON "receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "receipts_reference_idx" ON "receipts"("reference");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
