#!/usr/bin/env node
/**
 * Post-cleanup verification (heightt-backend) — read only.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  const content = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const m = content.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\n]+)["']?\s*$/m);
  if (!m) throw new Error(`DATABASE_URL not found in ${file}`);
  process.env.DATABASE_URL = m[1];
}
loadEnv('.env.production');

const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    const tables = [
      'users', 'admins', 'sessions', 'user_profiles', 'email_verifications',
      'institutions', 'faculties', 'departments', 'academic_levels', 'academic_sessions',
      'organizations', 'organization_memberships', 'organization_join_requests',
      'student_profiles', 'student_academic_records', 'student_enrollments',
      'dues', 'due_assignments', 'due_payments', 'pending_payments',
      'receipts', 'payments', 'transactions', 'wallets', 'ledger_accounts',
      'permissions', 'role_permissions', 'system_roles',
      'audit_logs', 'activity_logs', 'operational_audit_logs', 'files', 'notifications',
    ];
    const rows = [];
    for (const t of tables) {
      const r = await client.query(`SELECT count(*)::int AS c FROM "${t}"`);
      rows.push([t, r.rows[0].c]);
    }
    console.log('=== POST-CLEANUP TABLE COUNTS ===');
    for (const [t, c] of rows) console.log(`  ${String(t).padEnd(30)} ${String(c).padStart(6)}`);

    console.log('\n=== REMAINING USERS ===');
    const u = await client.query('SELECT id, email, username, status FROM users');
    for (const r of u.rows) console.log(' ', r.id, r.email, r.username, r.status);

    console.log('\n=== REMAINING ADMINS ===');
    const a = await client.query('SELECT a.id, a."adminType", a.status, u.email FROM admins a JOIN users u ON u.id=a."userId"');
    for (const r of a.rows) console.log(' ', r.id, r.adminType, r.status, r.email);

    console.log('\n=== AUDIT/ACTIVITY LOG userId NULL (deleted-user FK cleanup) ===');
    const q = await client.query(
      `SELECT (SELECT count(*) FROM audit_logs WHERE "userId" IS NULL) audit_null_userid,
              (SELECT count(*) FROM audit_logs WHERE "userId" IS NOT NULL) audit_with_userid,
              (SELECT count(*) FROM activity_logs WHERE "userId" IS NULL) activity_null_userid,
              (SELECT count(*) FROM activity_logs WHERE "userId" IS NOT NULL) activity_with_userid`);
    console.log(' ', q.rows[0]);

    console.log('\n=== ORPHAN LINT (should all be 0 or NULL-safe) ===');
    const orphans = await client.query(`
      SELECT
        (SELECT count(*) FROM sessions s LEFT JOIN users u ON u.id=s."userId" WHERE u.id IS NULL) sessions_orphans,
        (SELECT count(*) FROM user_profiles p LEFT JOIN users u ON u.id=p."userId" WHERE u.id IS NULL) profiles_orphans,
        (SELECT count(*) FROM organizations o LEFT JOIN institutions i ON i.id=o."institutionId" WHERE o."institutionId" IS NOT NULL AND i.id IS NULL) org_institution_orphans,
        (SELECT count(*) FROM organizations o LEFT JOIN users u ON u.id=o."createdBy" WHERE o."createdBy" IS NOT NULL AND u.id IS NULL) org_creator_orphans,
        (SELECT count(*) FROM student_profiles sp LEFT JOIN users u ON u.id=sp."userId" WHERE u.id IS NULL) student_user_orphans,
        (SELECT count(*) FROM receipts r LEFT JOIN users u ON u.id=r."userId" WHERE u.id IS NULL) receipt_user_orphans,
        (SELECT count(*) FROM payments p LEFT JOIN users u ON u.id=p."payerId" WHERE u.id IS NULL) payment_user_orphans,
        (SELECT count(*) FROM admins ad LEFT JOIN users u ON u.id=ad."userId" WHERE u.id IS NULL) admin_user_orphans,
        (SELECT count(*) FROM due_assignments da LEFT JOIN student_profiles sp ON sp.id=da."studentId" WHERE sp.id IS NULL) dueassign_student_orphans,
        (SELECT count(*) FROM wallet_holds wh LEFT JOIN wallets w ON w.id=wh."walletId" WHERE w.id IS NULL) hold_wallet_orphans,
        (SELECT count(*) FROM ledger_entries le LEFT JOIN ledger_accounts la ON la.id=le."accountId" WHERE la.id IS NULL) entry_acct_orphans,
        (SELECT count(*) FROM ledger_entries le LEFT JOIN transactions t ON t.id=le."transactionId" WHERE t.id IS NULL) entry_txn_orphans`);
    console.log(' ', orphans.rows[0]);

    console.log("\n=== ADMIN'S OWN DATA (should all be 0) ===");
    const self = await client.query(`
      SELECT
        u.id,
        (SELECT count(*) FROM student_profiles sp WHERE sp."userId"=u.id) student_profiles,
        (SELECT count(*) FROM organization_memberships om WHERE om."userId"=u.id) memberships,
        (SELECT count(*) FROM organizations o WHERE o."createdBy"=u.id) created_orgs,
        (SELECT count(*) FROM wallets w WHERE w."userId"=u.id) wallets,
        (SELECT count(*) FROM payments p WHERE p."payerId"=u.id) payments,
        (SELECT count(*) FROM dues d JOIN organizations o ON o.id=d."organizationId" WHERE o."createdBy"=u.id) dues
      FROM users u WHERE u.id = (SELECT a."userId" FROM admins a WHERE a."adminType"='PLATFORM_ADMIN' LIMIT 1)`);
    console.log(' ', self.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err.message);
  process.exit(1);
});