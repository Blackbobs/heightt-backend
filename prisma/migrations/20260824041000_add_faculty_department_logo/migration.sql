-- Add logo columns for faculty and department branding (used on receipts)
ALTER TABLE "faculties" ADD COLUMN IF NOT EXISTS "logo" TEXT;
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "logo" TEXT;
