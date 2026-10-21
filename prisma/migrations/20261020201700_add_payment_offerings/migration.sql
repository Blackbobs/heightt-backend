CREATE TYPE "PaymentOfferingStatus" AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'COMPLETED',
  'CANCELLED'
);

CREATE TABLE "payment_offerings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sessionId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "amount" INTEGER NOT NULL,
  "status" "PaymentOfferingStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_offerings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payments"
ADD COLUMN "paymentOfferingId" TEXT;

ALTER TABLE "pending_payments"
ADD COLUMN "paymentOfferingId" TEXT;

CREATE INDEX "payment_offerings_organizationId_status_createdAt_idx"
ON "payment_offerings"("organizationId", "status", "createdAt" DESC);

CREATE INDEX "payment_offerings_sessionId_idx"
ON "payment_offerings"("sessionId");

CREATE INDEX "payments_paymentOfferingId_idx"
ON "payments"("paymentOfferingId");

CREATE UNIQUE INDEX "payments_payerId_paymentOfferingId_key"
ON "payments"("payerId", "paymentOfferingId");

CREATE INDEX "pending_payments_paymentOfferingId_idx"
ON "pending_payments"("paymentOfferingId");

CREATE UNIQUE INDEX "pending_payments_userId_paymentOfferingId_status_key"
ON "pending_payments"("userId", "paymentOfferingId", "status");

ALTER TABLE "payment_offerings"
ADD CONSTRAINT "payment_offerings_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_offerings"
ADD CONSTRAINT "payment_offerings_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "academic_sessions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments"
ADD CONSTRAINT "payments_paymentOfferingId_fkey"
FOREIGN KEY ("paymentOfferingId") REFERENCES "payment_offerings"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pending_payments"
ADD CONSTRAINT "pending_payments_paymentOfferingId_fkey"
FOREIGN KEY ("paymentOfferingId") REFERENCES "payment_offerings"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
