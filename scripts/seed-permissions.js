#!/usr/bin/env node
/**
 * RBAC permission seeder.
 *
 * 1. (always) Seeds the `permissions` catalog table with every permission key
 *    used across the backend: rbac.service.ts#assignDefaultPermissions,
 *    auth/permission.service.ts#PERMISSIONS and every @RequirePermission()
 *    decorator. This feeds GET /rbac/permissions and the `allPermissions`
 *    list returned by GET /rbac/admins/:id, so granular keys such as
 *    `finance:due:create` become grantable from the admin UI.
 *
 * 2. (--sync-defaults) Backfills MISSING default permissions onto every ACTIVE
 *    admin row according to its adminType, mirroring
 *    rbac.service.ts#assignDefaultPermissions. ADD-ONLY: existing grants are
 *    never removed. PLATFORM_ADMIN rows are skipped (AdminGuard bypasses
 *    permission checks for them).
 *
 * Usage:
 *   node scripts/seed-permissions.js                     # catalog only
 *   node scripts/seed-permissions.js --sync-defaults     # catalog + backfill admins
 *   node scripts/seed-permissions.js --sync-defaults --admin-id=<adminId>
 *   node scripts/seed-permissions.js --dry-run           # show what would change
 *
 * Idempotent: safe to run repeatedly.
 */
require('dotenv').config();
const { Pool } = require('pg');

const args = process.argv.slice(2);
const SYNC_DEFAULTS = args.includes('--sync-defaults');
const DRY_RUN = args.includes('--dry-run');
const adminIdArg = args.find((a) => a.startsWith('--admin-id='));
const ONLY_ADMIN_ID = adminIdArg ? adminIdArg.split('=')[1] : null;

const PERMISSION_CATALOG = [
  // Users
  { key: 'users:create', name: 'Create users', category: 'USERS' },
  { key: 'users:read', name: 'View users', category: 'USERS' },
  { key: 'users:update', name: 'Update users', category: 'USERS' },
  { key: 'users:delete', name: 'Delete users', category: 'USERS' },
  { key: 'users:manage', name: 'Manage users', category: 'USERS' },

  // Institution
  { key: 'institution:create', name: 'Create institutions', category: 'INSTITUTION' },
  { key: 'institution:read', name: 'View institutions', category: 'INSTITUTION' },
  { key: 'institution:update', name: 'Update institutions', category: 'INSTITUTION' },
  { key: 'institution:delete', name: 'Delete institutions', category: 'INSTITUTION' },
  { key: 'institution:manage', name: 'Manage institutions', category: 'INSTITUTION' },

  // Faculty
  { key: 'faculty:create', name: 'Create faculties', category: 'FACULTY' },
  { key: 'faculty:update', name: 'Update faculties', category: 'FACULTY' },
  { key: 'faculty:delete', name: 'Delete faculties', category: 'FACULTY' },
  { key: 'faculty:manage', name: 'Manage faculties', category: 'FACULTY' },

  // Department
  { key: 'department:create', name: 'Create departments', category: 'DEPARTMENT' },
  { key: 'department:update', name: 'Update departments', category: 'DEPARTMENT' },
  { key: 'department:delete', name: 'Delete departments', category: 'DEPARTMENT' },
  { key: 'department:manage', name: 'Manage departments', category: 'DEPARTMENT' },

  // Academic levels / sessions
  { key: 'academic_level:create', name: 'Create academic levels', category: 'ACADEMIC_LEVEL' },
  { key: 'academic_level:read', name: 'View academic levels', category: 'ACADEMIC_LEVEL' },
  { key: 'academic_level:update', name: 'Update academic levels', category: 'ACADEMIC_LEVEL' },
  { key: 'academic_level:delete', name: 'Delete academic levels', category: 'ACADEMIC_LEVEL' },
  { key: 'academic_session:create', name: 'Create academic sessions', category: 'ACADEMIC_SESSION' },
  { key: 'academic_session:read', name: 'View academic sessions', category: 'ACADEMIC_SESSION' },
  { key: 'academic_session:update', name: 'Update academic sessions', category: 'ACADEMIC_SESSION' },
  { key: 'academic_session:delete', name: 'Delete academic sessions', category: 'ACADEMIC_SESSION' },

  // Organization
  { key: 'organization:create', name: 'Create organizations', category: 'ORGANIZATION' },
  { key: 'organization:read', name: 'View organizations', category: 'ORGANIZATION' },
  { key: 'organization:update', name: 'Update organizations', category: 'ORGANIZATION' },
  { key: 'organization:delete', name: 'Delete organizations', category: 'ORGANIZATION' },
  { key: 'organization:manage', name: 'Manage organizations', category: 'ORGANIZATION' },
  { key: 'organization:approve', name: 'Approve organizations', category: 'ORGANIZATION' },
  { key: 'organization:activate', name: 'Activate organizations', category: 'ORGANIZATION' },
  { key: 'organization:manage_members', name: 'Manage organization members', category: 'ORGANIZATION' },
];

// Finance
const FINANCE_PERMISSIONS = [
  { key: 'finance:read', name: 'View finance', category: 'FINANCE' },
  { key: 'finance:create', name: 'Create finance records', category: 'FINANCE' },
  { key: 'finance:update', name: 'Update finance records', category: 'FINANCE' },
  { key: 'finance:delete', name: 'Delete finance records', category: 'FINANCE' },
  { key: 'finance:manage', name: 'Manage finance', category: 'FINANCE' },
  { key: 'finance:approve', name: 'Approve finance records', category: 'FINANCE' },
  { key: 'finance:review', name: 'Review finance records', category: 'FINANCE' },
  { key: 'finance:export', name: 'Export finance data', category: 'FINANCE' },
  { key: 'finance:credit', name: 'Credit wallets', category: 'FINANCE' },
  { key: 'finance:debit', name: 'Debit wallets', category: 'FINANCE' },
  { key: 'finance:manual', name: 'Manual finance operations', category: 'FINANCE' },
  { key: 'finance:reports', name: 'Finance reports', category: 'FINANCE' },
  { key: 'finance:withdrawal:approve', name: 'Approve withdrawals', category: 'FINANCE' },
  { key: 'finance:withdrawal:platform', name: 'Platform withdrawal operations', category: 'FINANCE' },
  { key: 'finance:due:create', name: 'Create dues', category: 'FINANCE' },
  { key: 'finance:due:assign', name: 'Assign dues', category: 'FINANCE' },
  { key: 'finance:due:view', name: 'View dues', category: 'FINANCE' },
  { key: 'finance:due:delete', name: 'Delete dues', category: 'FINANCE' },
];

// Students / academic / communication
const ACADEMIC_SIDE_PERMISSIONS = [
  { key: 'student:create', name: 'Create students', category: 'STUDENT' },
  { key: 'student:read', name: 'View students', category: 'STUDENT' },
  { key: 'student:update', name: 'Update students', category: 'STUDENT' },
  { key: 'student:delete', name: 'Delete students', category: 'STUDENT' },
  { key: 'student:verify', name: 'Verify students', category: 'STUDENT' },
  { key: 'student:promote', name: 'Promote students', category: 'STUDENT' },
  { key: 'student:manage', name: 'Manage students', category: 'STUDENT' },
  { key: 'academic:read', name: 'View academic records', category: 'ACADEMIC' },
  { key: 'academic:create', name: 'Create academic records', category: 'ACADEMIC' },
  { key: 'academic:update', name: 'Update academic records', category: 'ACADEMIC' },
  { key: 'academic:delete', name: 'Delete academic records', category: 'ACADEMIC' },
  { key: 'academic:manage', name: 'Manage academic records', category: 'ACADEMIC' },
  { key: 'communication:create', name: 'Send communications', category: 'COMMUNICATION' },
  { key: 'communication:read', name: 'View communications', category: 'COMMUNICATION' },
  { key: 'communication:update', name: 'Update communications', category: 'COMMUNICATION' },
  { key: 'communication:delete', name: 'Delete communications', category: 'COMMUNICATION' },
  { key: 'communication:manage', name: 'Manage communications', category: 'COMMUNICATION' },
];

// Events / governance / system / analytics / admin / misc
const PLATFORM_PERMISSIONS = [
  { key: 'event:create', name: 'Create events', category: 'EVENT' },
  { key: 'event:read', name: 'View events', category: 'EVENT' },
  { key: 'event:update', name: 'Update events', category: 'EVENT' },
  { key: 'event:delete', name: 'Delete events', category: 'EVENT' },
  { key: 'event:manage', name: 'Manage events', category: 'EVENT' },
  { key: 'event:approve', name: 'Approve events', category: 'EVENT' },
  { key: 'governance:create', name: 'Create governance items', category: 'GOVERNANCE' },
  { key: 'governance:read', name: 'View governance items', category: 'GOVERNANCE' },
  { key: 'governance:update', name: 'Update governance items', category: 'GOVERNANCE' },
  { key: 'governance:delete', name: 'Delete governance items', category: 'GOVERNANCE' },
  { key: 'governance:manage', name: 'Manage governance', category: 'GOVERNANCE' },
  { key: 'governance:election', name: 'Elections overview', category: 'GOVERNANCE' },
  { key: 'governance:election:create', name: 'Create elections', category: 'GOVERNANCE' },
  { key: 'governance:election:manage', name: 'Manage elections', category: 'GOVERNANCE' },
  { key: 'governance:election:nominate', name: 'Nominate candidates', category: 'GOVERNANCE' },
  { key: 'governance:election:vote', name: 'Vote in elections', category: 'GOVERNANCE' },
  { key: 'system:read', name: 'View system settings', category: 'SYSTEM' },
  { key: 'system:update', name: 'Update system settings', category: 'SYSTEM' },
  { key: 'system:manage', name: 'Manage system', category: 'SYSTEM' },
  { key: 'system:maintenance', name: 'Maintenance controls', category: 'SYSTEM' },
  { key: 'system:feature_flag', name: 'Feature flags', category: 'SYSTEM' },
  { key: 'analytics:read', name: 'View analytics', category: 'ANALYTICS' },
  { key: 'analytics:export', name: 'Export analytics', category: 'ANALYTICS' },
  { key: 'analytics:manage', name: 'Manage analytics', category: 'ANALYTICS' },
  { key: 'admin:assign', name: 'Assign admin roles', category: 'ADMIN' },
  { key: 'admin:revoke', name: 'Revoke admin roles', category: 'ADMIN' },
  { key: 'admin:view', name: 'View admins', category: 'ADMIN' },
  { key: 'admin:manage', name: 'Manage admins', category: 'ADMIN' },
  { key: 'audit:read', name: 'View audit logs', category: 'AUDIT' },
  { key: 'dashboard:read', name: 'View dashboards', category: 'DASHBOARD' },
  { key: 'dashboard:manage', name: 'Manage dashboards', category: 'DASHBOARD' },
  { key: 'files:read', name: 'Read files', category: 'FILES' },
  { key: 'files:manage', name: 'Manage files', category: 'FILES' },
  { key: 'search:manage', name: 'Manage search index', category: 'SEARCH' },
];

PERMISSION_CATALOG.push(
  ...FINANCE_PERMISSIONS,
  ...ACADEMIC_SIDE_PERMISSIONS,
  ...PLATFORM_PERMISSIONS,
);

// Default permissions per adminType - MUST mirror rbac.service.ts#assignDefaultPermissions
const DEFAULT_PERMISSIONS = {
  PLATFORM_ADMIN: [
    'users:create', 'users:read', 'users:update', 'users:delete', 'users:manage',
    'institution:create', 'institution:read', 'institution:update', 'institution:delete', 'institution:manage',
    'organization:create', 'organization:read', 'organization:update', 'organization:delete', 'organization:manage',
    'finance:read', 'finance:create', 'finance:update', 'finance:delete', 'finance:approve', 'finance:export',
    'finance:due:create', 'finance:due:assign', 'finance:due:view', 'finance:due:delete',
    'student:create', 'student:read', 'student:update', 'student:delete', 'student:verify', 'student:promote',
    'academic:read', 'academic:create', 'academic:update', 'academic:delete',
    'communication:create', 'communication:read', 'communication:update', 'communication:delete',
    'admin:assign', 'admin:revoke', 'admin:view', 'admin:manage',
    'analytics:read', 'analytics:export',
    'system:read', 'system:update', 'system:manage', 'system:maintenance', 'system:feature_flag',
  ],
  INSTITUTION_ADMIN: [
    'users:read', 'institution:read', 'institution:update',
    'organization:read', 'organization:create', 'organization:update',
    'finance:read', 'finance:due:create', 'finance:due:assign', 'finance:due:view',
    'student:read', 'student:update', 'academic:read', 'communication:create',
  ],
  FACULTY_ADMIN: [
    'users:read', 'student:read', 'student:update', 'academic:read', 'organization:read',
    'communication:create', 'finance:read',
    'finance:due:create', 'finance:due:assign', 'finance:due:view',
  ],
  DEPARTMENT_ADMIN: [
    'users:read', 'student:read', 'academic:read', 'communication:create',
    'finance:read', 'finance:due:create', 'finance:due:assign', 'finance:due:view',
  ],
  ORGANIZATION_ADMIN: [
    'users:read', 'organization:read', 'organization:update', 'organization:manage',
    'finance:read', 'finance:due:create', 'finance:due:assign', 'finance:due:view', 'finance:due:delete',
    'communication:create', 'student:read',
  ],
  CLUB_ADMIN: [
    'users:read', 'organization:read', 'organization:update', 'communication:create',
    'finance:read', 'finance:due:create', 'finance:due:assign', 'finance:due:view',
  ],
};
DEFAULT_PERMISSIONS.DEFAULT = ['users:read'];

async function seedCatalog(pool) {
  console.log(`\n📋 Seeding permission catalog (${PERMISSION_CATALOG.length} keys)...`);
  const { rows } = await pool.query(`SELECT key FROM permissions`);
  const existing = new Set(rows.map((r) => r.key));
  const missing = PERMISSION_CATALOG.filter((p) => !existing.has(p.key));

  if (missing.length === 0) {
    console.log('✅ Catalog already up to date.');
    return;
  }
  console.log(`   Missing ${missing.length} key(s): ${missing.map((p) => p.key).join(', ')}`);
  if (DRY_RUN) {
    console.log('🔍 Dry run - no rows written.');
    return;
  }

  let inserted = 0;
  for (const p of missing) {
    const res = await pool.query(
      `INSERT INTO permissions (id, key, name, description, category)
       VALUES ('cperm' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4)
       ON CONFLICT (key) DO NOTHING`,
      [p.key, p.name, `${p.name} (auto-seeded by scripts/seed-permissions.js)`, p.category],
    );
    inserted += res.rowCount;
  }
  console.log(`✅ Inserted ${inserted} catalog row(s).`);
}

async function syncAdminDefaults(pool) {
  console.log('\n🔄 Syncing default permissions onto ACTIVE admins (ADD-only)...');
  const { rows: admins } = await pool.query(
    `SELECT id, "userId", "adminType" FROM admins WHERE status = 'ACTIVE'${ONLY_ADMIN_ID ? ' AND id = $1' : ''} ORDER BY "assignedAt" ASC`,
    ONLY_ADMIN_ID ? [ONLY_ADMIN_ID] : [],
  );

  if (admins.length === 0) {
    console.log(`⚠️  No matching ACTIVE admins found${ONLY_ADMIN_ID ? ` for id=${ONLY_ADMIN_ID}` : ''}.`);
    return;
  }

  for (const admin of admins) {
    if (admin.adminType === 'PLATFORM_ADMIN') {
      console.log(`⏭️  Skipping PLATFORM_ADMIN ${admin.id} (guard bypasses checks for platform admins).`);
      continue;
    }
    const defaults = DEFAULT_PERMISSIONS[admin.adminType] || DEFAULT_PERMISSIONS.DEFAULT;
    const { rows: owned } = await pool.query(
      `SELECT "permissionKey" FROM admin_permissions WHERE "adminId" = $1`,
      [admin.id],
    );
    const ownedKeys = new Set(owned.map((r) => r.permissionKey));
    const toAdd = defaults.filter((k) => !ownedKeys.has(k));

    if (toAdd.length === 0) {
      console.log(`✅ ${admin.adminType} ${admin.id}: all ${defaults.length} defaults already present.`);
      continue;
    }
    console.log(`➕ ${admin.adminType} ${admin.id}: adding ${toAdd.length} default(s): ${toAdd.join(', ')}`);
    if (DRY_RUN) continue;

    for (const key of toAdd) {
      await pool.query(
        `INSERT INTO admin_permissions
           (id, "adminId", "permissionKey", "permissionCategory", "permissionAction", "resourceId", "grantedBy")
         SELECT 'cperm' || replace(gen_random_uuid()::text, '-', ''), $1, $2, 'SYSTEM', 'MANAGE', NULL, 'rbac-seed'
         WHERE NOT EXISTS (
           SELECT 1 FROM admin_permissions WHERE "adminId" = $1 AND "permissionKey" = $2
         )`,
        [admin.id, key],
      );
    }
  }
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await seedCatalog(pool);
    if (SYNC_DEFAULTS) await syncAdminDefaults(pool);
    if (DRY_RUN) {
      console.log('\n🔍 Dry run complete - nothing was written.');
    } else {
      console.log('\n🎉 Done. AdminGuard picks these up immediately (no cache, no restart needed).');
      console.log('ℹ️  Note: GET /rbac/permissions caches for 10 min; the UI list refreshes after that TTL or via cache invalidation/restart.');
    }
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();


