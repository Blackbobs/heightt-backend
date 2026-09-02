-- Composite indexes for the application's most frequent filter/order pairs.
CREATE INDEX "student_profiles_institutionId_createdAt_idx"
  ON "student_profiles"("institutionId", "createdAt");
CREATE INDEX "organizations_institutionId_createdAt_idx"
  ON "organizations"("institutionId", "createdAt");
CREATE INDEX "organization_memberships_userId_status_idx"
  ON "organization_memberships"("userId", "status");
CREATE INDEX "organization_memberships_organizationId_status_idx"
  ON "organization_memberships"("organizationId", "status");
CREATE INDEX "admins_userId_status_idx"
  ON "admins"("userId", "status");
CREATE INDEX "transactions_walletId_status_createdAt_idx"
  ON "transactions"("walletId", "status", "createdAt" DESC);
CREATE INDEX "payments_payerId_status_createdAt_idx"
  ON "payments"("payerId", "status", "createdAt" DESC);
CREATE INDEX "payments_organizationId_status_paidAt_idx"
  ON "payments"("organizationId", "status", "paidAt");
CREATE INDEX "due_assignments_studentId_isPaid_createdAt_idx"
  ON "due_assignments"("studentId", "isPaid", "createdAt" DESC);
CREATE INDEX "announcements_organizationId_isPublished_publishedAt_idx"
  ON "announcements"("organizationId", "isPublished", "publishedAt" DESC);
CREATE INDEX "audit_logs_userId_createdAt_idx"
  ON "audit_logs"("userId", "createdAt" DESC);
CREATE INDEX "audit_logs_entity_entityId_createdAt_idx"
  ON "audit_logs"("entity", "entityId", "createdAt" DESC);
CREATE INDEX "activity_logs_userId_createdAt_idx"
  ON "activity_logs"("userId", "createdAt" DESC);
CREATE INDEX "events_organizationId_status_startDate_idx"
  ON "events"("organizationId", "status", "startDate");
CREATE INDEX "event_registrations_eventId_status_idx"
  ON "event_registrations"("eventId", "status");
CREATE INDEX "files_userId_isDeleted_createdAt_idx"
  ON "files"("userId", "isDeleted", "createdAt" DESC);
CREATE INDEX "files_organizationId_isDeleted_createdAt_idx"
  ON "files"("organizationId", "isDeleted", "createdAt" DESC);

-- Prisma's insensitive `contains` filters compile to ILIKE '%term%'. Trigram
-- indexes allow PostgreSQL to serve those searches without full table scans.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "users_email_trgm_idx"
  ON "users" USING GIN ("email" gin_trgm_ops);
CREATE INDEX "users_username_trgm_idx"
  ON "users" USING GIN ("username" gin_trgm_ops);
CREATE INDEX "user_profiles_firstName_trgm_idx"
  ON "user_profiles" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX "user_profiles_lastName_trgm_idx"
  ON "user_profiles" USING GIN ("lastName" gin_trgm_ops);
CREATE INDEX "organizations_name_trgm_idx"
  ON "organizations" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "institutions_name_trgm_idx"
  ON "institutions" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "institutions_code_trgm_idx"
  ON "institutions" USING GIN ("code" gin_trgm_ops);
