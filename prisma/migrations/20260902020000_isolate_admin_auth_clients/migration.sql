CREATE TYPE "AuthClientType" AS ENUM (
  'USER',
  'ORGANIZATION_ADMIN',
  'PLATFORM_ADMIN'
);

ALTER TABLE "sessions"
ADD COLUMN "authClient" "AuthClientType" NOT NULL DEFAULT 'USER';

CREATE INDEX "sessions_authClient_idx" ON "sessions"("authClient");
