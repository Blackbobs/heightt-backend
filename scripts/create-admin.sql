-- First, find the user ID
SELECT id, email, username FROM users WHERE email = 'ayodejiayodele350@gmail.com';

-- Then insert the admin record (replace USER_ID with the actual ID)
INSERT INTO admins (
  id,
  "userId",
  "adminType",
  status,
  "assignedAt",
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid()::text,
  'cmsqwr9vn0004rntv67ozmnct', -- Replace with actual user ID
  'PLATFORM_ADMIN',
  'ACTIVE',
  NOW(),
  NOW(),
  NOW()
);

-- Verify the admin was created
SELECT a.*, u.email, u.username 
FROM admins a
JOIN users u ON a."userId" = u.id
WHERE a."userId" = 'cmsqwr9vn0004rntv67ozmnct';