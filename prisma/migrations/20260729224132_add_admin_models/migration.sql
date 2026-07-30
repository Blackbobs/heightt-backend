-- CreateEnum
CREATE TYPE "AdminType" AS ENUM ('PLATFORM_ADMIN', 'INSTITUTION_ADMIN', 'FACULTY_ADMIN', 'DEPARTMENT_ADMIN', 'ORGANIZATION_ADMIN', 'CLUB_ADMIN');

-- CreateEnum
CREATE TYPE "PermissionCategory" AS ENUM ('USER', 'INSTITUTION', 'ORGANIZATION', 'FINANCE', 'STUDENT', 'ACADEMIC', 'COMMUNICATION', 'EVENT', 'GOVERNANCE', 'SYSTEM', 'ANALYTICS');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'REVIEW', 'EXPORT', 'IMPORT', 'MANAGE', 'ASSIGN', 'REVOKE');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "SystemRoleCategory" AS ENUM ('PLATFORM', 'INSTITUTION', 'ORGANIZATION', 'CLUB');

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adminType" "AdminType" NOT NULL,
    "institutionId" TEXT,
    "facultyId" TEXT,
    "departmentId" TEXT,
    "organizationId" TEXT,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_permissions" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "permissionCategory" "PermissionCategory" NOT NULL,
    "permissionAction" "PermissionAction" NOT NULL,
    "resourceId" TEXT,
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "SystemRoleCategory" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admins_userId_idx" ON "admins"("userId");

-- CreateIndex
CREATE INDEX "admins_adminType_idx" ON "admins"("adminType");

-- CreateIndex
CREATE INDEX "admins_status_idx" ON "admins"("status");

-- CreateIndex
CREATE UNIQUE INDEX "admins_userId_adminType_institutionId_facultyId_departmentI_key" ON "admins"("userId", "adminType", "institutionId", "facultyId", "departmentId", "organizationId");

-- CreateIndex
CREATE INDEX "admin_permissions_adminId_idx" ON "admin_permissions"("adminId");

-- CreateIndex
CREATE INDEX "admin_permissions_permissionKey_idx" ON "admin_permissions"("permissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "admin_permissions_adminId_permissionKey_resourceId_key" ON "admin_permissions"("adminId", "permissionKey", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "system_roles_name_key" ON "system_roles"("name");

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_permissions" ADD CONSTRAINT "admin_permissions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
