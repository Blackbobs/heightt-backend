-- Add optional branding to all organization types.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "logo" TEXT;
