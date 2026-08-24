-- CreateEnum
CREATE TYPE "SessionScope" AS ENUM ('INSTITUTION', 'FACULTY', 'DEPARTMENT', 'LEVEL');

-- AlterTable: academic_sessions
ALTER TABLE "academic_sessions" ADD COLUMN "facultyId" TEXT;
ALTER TABLE "academic_sessions" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "academic_sessions" ADD COLUMN "academicLevelId" TEXT;
ALTER TABLE "academic_sessions" ADD COLUMN "scope" "SessionScope" NOT NULL DEFAULT 'INSTITUTION';

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculties" ("id") ON DELETE SET NULL;
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments" ("id") ON DELETE SET NULL;
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_academicLevelId_fkey" FOREIGN KEY ("academicLevelId") REFERENCES "academic_levels" ("id") ON DELETE SET NULL;

-- CreateIndex
CREATE INDEX "academic_sessions_facultyId_idx" ON "academic_sessions" ("facultyId");
CREATE INDEX "academic_sessions_departmentId_idx" ON "academic_sessions" ("departmentId");
CREATE INDEX "academic_sessions_academicLevelId_idx" ON "academic_sessions" ("academicLevelId");
CREATE INDEX "academic_sessions_scope_idx" ON "academic_sessions" ("scope");