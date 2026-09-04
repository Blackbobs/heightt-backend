-- Organizations may exist independently of an educational institution.
ALTER TYPE "MembershipType" ADD VALUE IF NOT EXISTS 'MEMBER' BEFORE 'STUDENT';

ALTER TABLE "organizations"
ALTER COLUMN "institutionId" DROP NOT NULL;

-- An independent organization cannot point into an academic hierarchy.
ALTER TABLE "organizations"
ADD CONSTRAINT "organizations_independent_academic_fields_check"
CHECK (
  "institutionId" IS NOT NULL
  OR (
    "facultyId" IS NULL
    AND "departmentId" IS NULL
    AND "academicLevelId" IS NULL
    AND "academicSessionId" IS NULL
  )
);

-- PostgreSQL treats NULLs as distinct in the existing compound unique key,
-- so enforce unique slugs in the independent-organization namespace.
CREATE UNIQUE INDEX "organizations_independent_slug_key"
ON "organizations" ("slug")
WHERE "institutionId" IS NULL;
