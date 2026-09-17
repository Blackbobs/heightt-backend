CREATE TABLE "guest_payers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "matricNumber" TEXT,
    "institutionId" TEXT NOT NULL,
    "facultyId" TEXT,
    "departmentId" TEXT,
    "academicLevelId" TEXT,
    "placeholderUserId" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guest_payers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guest_claim_codes" (
    "id" TEXT NOT NULL,
    "guestPayerId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guest_claim_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_payers_placeholderUserId_key" ON "guest_payers"("placeholderUserId");
CREATE INDEX "guest_payers_email_idx" ON "guest_payers"("email");
CREATE INDEX "guest_payers_institutionId_idx" ON "guest_payers"("institutionId");
CREATE INDEX "guest_payers_claimedById_idx" ON "guest_payers"("claimedById");
CREATE INDEX "guest_claim_codes_guestPayerId_expiresAt_idx" ON "guest_claim_codes"("guestPayerId", "expiresAt");

ALTER TABLE "guest_payers" ADD CONSTRAINT "guest_payers_placeholderUserId_fkey" FOREIGN KEY ("placeholderUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_payers" ADD CONSTRAINT "guest_payers_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_payers" ADD CONSTRAINT "guest_payers_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_payers" ADD CONSTRAINT "guest_payers_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_payers" ADD CONSTRAINT "guest_payers_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_payers" ADD CONSTRAINT "guest_payers_academicLevelId_fkey" FOREIGN KEY ("academicLevelId") REFERENCES "academic_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_claim_codes" ADD CONSTRAINT "guest_claim_codes_guestPayerId_fkey" FOREIGN KEY ("guestPayerId") REFERENCES "guest_payers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
