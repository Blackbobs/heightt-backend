ALTER TABLE "student_profiles"
ADD COLUMN "isDirectEntry" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "dues"
ADD COLUMN "isDirectEntryEligible" BOOLEAN NOT NULL DEFAULT false;
