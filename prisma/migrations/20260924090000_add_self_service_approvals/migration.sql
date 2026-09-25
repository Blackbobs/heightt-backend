ALTER TABLE "organizations" ADD COLUMN "nameNormalized" TEXT;

CREATE TYPE "ApprovalEntityType" AS ENUM ('ORGANIZATION');
CREATE TYPE "ApprovalRequestStatus" AS ENUM (
  'PENDING', 'APPROVED', 'REJECTED'
);

CREATE TABLE "approval_requests" (
  "id" TEXT NOT NULL,
  "entityType" "ApprovalEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "entityName" TEXT NOT NULL,
  "submittedBy" TEXT NOT NULL,
  "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "approval_requests_entityType_entityId_key"
  ON "approval_requests" ("entityType", "entityId");
CREATE INDEX "approval_requests_status_createdAt_idx"
  ON "approval_requests" ("status", "createdAt");
CREATE INDEX "approval_requests_submittedBy_status_idx"
  ON "approval_requests" ("submittedBy", "status");

UPDATE "organizations"
SET "nameNormalized" = regexp_replace(lower("name"), '[^a-z0-9]+', '', 'g')
WHERE "nameNormalized" IS NULL;

CREATE UNIQUE INDEX "organizations_independent_name_normalized_key"
  ON "organizations" ("nameNormalized")
  WHERE "institutionId" IS NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "organizations_institution_name_normalized_key"
  ON "organizations" ("institutionId", "nameNormalized")
  WHERE "institutionId" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "organizations_institution_slug_no_session_key"
  ON "organizations" ("institutionId", "slug")
  WHERE "institutionId" IS NOT NULL AND "academicSessionId" IS NULL;
