-- CreateEnum
CREATE TYPE "SessionScope" AS ENUM ('INSTITUTION', 'FACULTY', 'DEPARTMENT', 'LEVEL');

-- Add columns
ALTER TABLE "academic_sessions" ADD COLUMN IF NOT EXISTS "facultyId" TEXT;
ALTER TABLE "academic_sessions" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "academic_sessions" ADD COLUMN IF NOT EXISTS "academicLevelId" TEXT;
ALTER TABLE "academic_sessions" ADD COLUMN IF NOT EXISTS "scope" "SessionScope" NOT NULL DEFAULT 'INSTITUTION';

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT IF NOT EXISTS "academic_sessions_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculties" ("id") ON DELETE SET NULL;
ALTER TABLE "academic_sessions" ADD CONSTRAINT IF NOT EXISTS "academic_sessions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments" ("id") ON DELETE SET NULL;
ALTER TABLE "academic_sessions" ADD CONSTRAINT IF NOT EXISTS "academic_sessions_academicLevelId_fkey" FOREIGN KEY ("academicLevelId") REFERENCES "academic_levels" ("id") ON DELETE SET NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "academic_sessions_facultyId_idx" ON "academic_sessions" ("facultyId");
CREATE INDEX IF NOT EXISTS "academic_sessions_departmentId_idx" ON "academic_sessions" ("departmentId");
CREATE INDEX IF NOT EXISTS "academic_sessions_academicLevelId_idx" ON "academic_sessions" ("academicLevelId");
CREATE INDEX IF NOT EXISTS "academic_sessions_scope_idx" ON "academic_sessions" ("scope");
</arg_value>
<task_progress>
- [x] Read schema.prisma
- [x] Update schema with missing fields
- [x] Fix controller duplicates
- [x] Fix service type errors
- [x] Run prisma generate
- [x] Fix script PrismaClient
- [x] Verify compilation (0 errors)
- [x] Create migration for schema changes
- [ ] Apply migration to database
- [ ] Final verification
</task_progress>
</write_to_file></tool_call>