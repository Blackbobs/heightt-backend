#!/usr/bin/env node
/**
 * Create a DEPARTMENT_ADMIN for an existing user account.
 *
 * Mirrors the existing department admins: same department scope
 * (departmentId + facultyId + institutionId) and the exact
 * `admin_permissions` grant set they already have.
 *
 * Usage:
 *   node scripts/create-department-admin.js <email> [--department-id=<id>]
 *
 * Idempotent: exits successfully if the user is already an admin.
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'));
const departmentIdArg = args.find((a) => a.startsWith('--department-id='));

function newId(prefix) {
  // cuid()-shaped id: 'c' + 32 hex chars (admins table uses TEXT PK)
  return `${prefix}${require('crypto')
    .randomBytes(16)
    .toString('hex')}`;
}

async function main() {
  if (!email) {
    console.error(
      'Usage: node scripts/create-department-admin.js <email> [--department-id=<id>]',
    );
    process.exit(1);
  }

  // 1. Confirm the account exists
  const { rows: users } = await pool.query(
    `SELECT id, email, username, status, "emailVerified"
       FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  if (users.length === 0) {
    console.error(`❌ No account found for ${email}. Register the user first.`);
    process.exit(1);
  }
  const user = users[0];
  console.log(
    `✅ Account found: ${user.email} (${user.id}, username=${user.username}, status=${user.status})`,
  );

  // 2. Already an admin?
  const { rows: existing } = await pool.query(
    `SELECT id, "adminType", status, "departmentId" FROM admins WHERE "userId" = $1`,
    [user.id],
  );
  if (existing.length > 0) {
    console.log('⚠️ User already has an admin record:');
    console.log(JSON.stringify(existing, null, 2));
    return;
  }

  // 3. Resolve department scope (default: the department of existing dept admins,
  //    falling back to the only department in the system)
  const sourceAdminRow = departmentIdArg
    ? null
    : (
        await pool.query(
          `SELECT a."departmentId" FROM admins a
             WHERE a."adminType" = 'DEPARTMENT_ADMIN' AND a."departmentId" IS NOT NULL
             ORDER BY a."assignedAt" ASC LIMIT 1`,
        )
      ).rows[0];
  const departmentId = departmentIdArg
    ? departmentIdArg.split('=')[1]
    : sourceAdminRow?.departmentId;

  if (!departmentId) {
    console.error(
      '❌ No department resolved. Pass --department-id=<id> or create a DEPARTMENT_ADMIN first.',
    );
    process.exit(1);
  }

  const { rows: depRows } = await pool.query(
    `SELECT d.id, d.name, d.code, d."facultyId", f."institutionId"
       FROM departments d JOIN faculties f ON f.id = d."facultyId"
      WHERE d.id = $1`,
    [departmentId],
  );
  if (depRows.length === 0) {
    console.error(`❌ Department not found: ${departmentId}`);
    process.exit(1);
  }
  const dept = depRows[0];
  console.log(
    `📁 Department: ${dept.name} (${dept.code}) | facultyId=${dept.facultyId} | institutionId=${dept.institutionId}`,
  );

  // 4. Resolve the permission set to copy (existing DEPARTMENT_ADMIN grants)
  const { rows: donorAdmins } = await pool.query(
    `SELECT id FROM admins
      WHERE "adminType" = 'DEPARTMENT_ADMIN' AND status = 'ACTIVE'
      ORDER BY "assignedAt" ASC`,
  );
  if (donorAdmins.length === 0) {
    console.error('❌ No existing DEPARTMENT_ADMIN to copy permissions from.');
    process.exit(1);
  }
  const { rows: donorPerms } = await pool.query(
    `SELECT DISTINCT ON ("permissionKey", "resourceId")
            "permissionKey", "permissionCategory", "permissionAction", "resourceId"
       FROM admin_permissions WHERE "adminId" = $1
      ORDER BY "permissionKey", "resourceId"`,
    [donorAdmins[0].id],
  );
  console.log(
    `🔑 Permission set to copy: ${donorPerms.length} key(s) (from admin ${donorAdmins[0].id})`,
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const adminId = newId('c');
    const { rows: created } = await client.query(
      `INSERT INTO admins
         (id, "userId", "adminType", "institutionId", "facultyId", "departmentId",
          "assignedAt", "updatedAt", status)
       VALUES ($1, $2, 'DEPARTMENT_ADMIN', $3, $4, $5, NOW(), NOW(), 'ACTIVE')
       RETURNING id, "adminType", status, "departmentId", "facultyId", "institutionId"`,
      [
        adminId,
        user.id,
        dept.institutionId,
        dept.facultyId,
        dept.id,
      ],
    );
    console.log('🎉 DEPARTMENT_ADMIN created:');
    console.log(JSON.stringify(created[0], null, 2));

    let granted = 0;
    for (const p of donorPerms) {
      const res = await client.query(
        `INSERT INTO admin_permissions
           (id, "adminId", "permissionKey", "permissionCategory",
            "permissionAction", "resourceId", "grantedBy")
         VALUES ($1, $2, $3, $4, $5, $6, 'system')
         ON CONFLICT ("adminId", "permissionKey", "resourceId") DO NOTHING`,
        [
          newId('cperm'),
          adminId,
          p.permissionKey,
          p.permissionCategory,
          p.permissionAction,
          p.resourceId,
        ],
      );
      granted += res.rowCount;
    }
    console.log(`🔑 Granted ${granted} permission(s).`);

    await client.query('COMMIT');
    console.log(
      `\n✅ Done. ${email} is now a DEPARTMENT_ADMIN of ${dept.name}. AdminGuard picks this up immediately (no restart needed).`,
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
