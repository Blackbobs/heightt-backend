-- These attributes are no longer collected or exposed by Heightt.
-- Existing user accounts and their relationships remain intact; only the
-- retired profile attributes are removed.
ALTER TABLE "user_profiles"
  DROP COLUMN IF EXISTS "phone",
  DROP COLUMN IF EXISTS "dateOfBirth",
  DROP COLUMN IF EXISTS "state",
  DROP COLUMN IF EXISTS "city",
  DROP COLUMN IF EXISTS "address",
  DROP COLUMN IF EXISTS "bio";
