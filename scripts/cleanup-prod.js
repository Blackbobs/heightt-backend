#!/usr/bin/env node
/**
 * Production cleanup script (heightt-backend)
 *
 * Purpose: wipe every org, student, due, receipt, payment and non-admin
 * user (plus ALL their related data) so the platform is clean for real
 * student onboarding.
 *
 * PRESERVED (untouched):
 *   - PLATFORM_ADMIN account: user row, its sessions, its user profile,
 *     its admin row + the seeded admin_permissions
 *   - Seeded `permissions` catalog and `system_roles`
 *   - Audit/activity/operational logs. Their `userId` is automatically
 *     SET NULL by the database for deleted users (FK side-effect only;
 *     rows themselves are never modified/deleted).
 *
 * REFERENCE DATA IS ALSO WIPED (per request): institutions, faculties,
 * departments, academic_levels, academic_sessions.
 *
 * WIPED (all rows / non-admin rows): organizations + all org-scoped
 * data, students + all student-scoped data, dues, due assignments, due
 * payments, receipts, payments, wallets, wallet holds, ledger
 * (accounts/entries/lines/journal entries), transactions, withdrawals,
 * refunds, settlements, savings, bank accounts, announcements,
 * notifications, queues, elections, executives, committees, events,
 * tickets, pending payments, files, all institutions/faculties/
 * departments/academic_levels/academic_sessions, non-admin
 * sessions/verifications, and every non platform-admin user.
 *
 * Usage:
 *   node scripts/cleanup-prod.js --dry-run   # inventory only, no writes
 *   node scripts/cleanup-prod.js --yes       # execute cleanup (REQUIRED)
 */
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load DATABASE_URL directly from .env.production. We intentionally
 * bypass `dotenv`/dotenvx (which was observed to intermittently inject a
 * broken hostname), and parse the file by hand so the connection string
 * is always the exact one in the production env file.
 */
function loadEnv(file) {
  const content = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const m = content.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\n]+)["']?\s*$/m);
  if (!m) throw new Error(`DATABASE_URL not found in ${file}`);
  process.env.DATABASE_URL = m[1];
}
loadEnv('.env.production');

const { Pool } = require('pg');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CONFIRMED = args.includes('--yes');

/**
 * DELETE order must respect FK constraints (RESTRICT FKs require the
 * referencing table to be emptied first). This list is dependency-safe:
 * children are always deleted before their parents.
 */
const FULL_WIPE_TABLES = [
  'attendances',
  'event_registrations',
  'ticket_purchases',
  'tickets',
  'events',
  'announcement_reads',
  'announcements',
  'due_payments',
  'pending_payments',
  'due_assignments',
  'dues',
  'receipts',
  'refunds',
  'settlements',
  'payments',
  'withdrawals',
  'withdrawal_webhooks',
  'journal_entries',
  'ledger_entries',
  'journal_lines',
  'transactions',
  'savings_transactions',
  'savings_goals',
  'wallet_holds',
  'wallets',
  'ledger_accounts',
  'bank_accounts',
  'membership_roles',
  'organization_join_requests',
  'organization_memberships',
  'roles',
  'role_permissions',
  'student_verifications',
  'student_enrollments',
  'student_promotions',
  'student_academic_records',
  'student_profiles',
  'votes',
  'candidates',
  'election_positions',
  'elections',
  'executive_members',
  'executive_terms',
  'committees',
  'notifications',
  'notification_preferences',
  'push_queue',
  'email_queue',
  'password_resets',
  'feature_flag_targets',
  'files',
  'organizations',
  'academic_sessions',
  'academic_levels',
  'departments',
  'faculties',
  'institutions',
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    // 1. Locate the platform admin we must preserve.
    const adminRes = await client.query(
      `SELECT u.id, u.email, u.username
         FROM users u
         JOIN admins a ON a."userId" = u.id
        WHERE a."adminType" = 'PLATFORM_ADMIN'
        ORDER BY u."createdAt" ASC
        LIMIT 1`,
    );
    if (adminRes.rows.length === 0) {
      throw new Error('FATAL: no PLATFORM_ADMIN found. Aborting to avoid locking everyone out.');
    }
    const admin = adminRes.rows[0];

    // 2. Snapshot counts for before/after verification.
    const allTables = [...FULL_WIPE_TABLES, 'admins', 'sessions', 'user_profiles', 'email_verifications', 'users'];
    const before = {};
    for (const t of allTables) {
      const r = await client.query(`SELECT count(*)::int AS c FROM "${t}"`);
      before[t] = r.rows[0].c;
    }

    console.log('');
    console.log('=== PROD CLEANUP PLAN ===');
    console.log(`Platform admin to KEEP: ${admin.email} (${admin.id})`);
    console.log('Preserved: permissions, system_roles, audit/activity/operational logs.');
    console.log('');
    console.log('Data that WILL BE DELETED (current row counts):');
    for (const [t, c] of Object.entries(before)) {
      if (c > 0) console.log(`  ${String(t).padEnd(28)} ${String(c).padStart(6)} rows`);
    }

    if (DRY_RUN) {
      console.log('');
      console.log('DRY RUN - nothing was deleted.');
      return;
    }
    if (!CONFIRMED) {
      console.log('');
      console.log('Refusing to execute without confirmation. Re-run with --yes');
      return;
    }

    // 3. Execute cleanup inside a single transaction.
    await client.query('BEGIN');

    for (const table of FULL_WIPE_TABLES) {
      const res = await client.query(`DELETE FROM "${table}"`);
      console.log(`  deleted ${String(table).padEnd(28)} ${res.rowCount} rows`);
    }

    // Remove rows belonging to non platform-admin users (cascades their
    // admin_permissions on admins; audit logs keep rows, get NULL userId).
    const partialStmts = [
      ['sessions', `DELETE FROM "sessions" WHERE "userId" <> $1`],
      ['user_profiles', `DELETE FROM "user_profiles" WHERE "userId" <> $1`],
      ['admins', `DELETE FROM "admins" WHERE "userId" <> $1`],
      ['email_verifications', `DELETE FROM "email_verifications" WHERE "userId" <> $1`],
    ];
    for (const [table, sql] of partialStmts) {
      const res = await client.query(sql, [admin.id]);
      console.log(`  deleted ${String(table).padEnd(28)} ${res.rowCount} rows (non-admin)`);
    }

    const usersRes = await client.query(`DELETE FROM "users" WHERE "id" <> $1`, [admin.id]);
    console.log(`  deleted ${String('users').padEnd(28)} ${usersRes.rowCount} rows (non-admin)`);

    // 4. Verify final state.
    const after = {};
    for (const t of allTables) {
      const r = await client.query(`SELECT count(*)::int AS c FROM "${t}"`);
      after[t] = r.rows[0].c;
    }
    const protectedRes = await client.query(
      `SELECT (SELECT count(*) FROM permissions) permissions,
              (SELECT count(*) FROM audit_logs) audit_logs,
              (SELECT count(*) FROM activity_logs) activity_logs,
              (SELECT count(*) FROM operational_audit_logs) operational_audit_logs,
              (SELECT count(*) FROM users) users`,
    );

    await client.query('COMMIT');

    console.log('');
    console.log('=== CLEANUP COMMITTED ===');
    for (const t of allTables) {
      console.log(`  ${String(t).padEnd(28)} ${String(before[t]).padStart(5)} -> ${String(after[t]).padStart(5)}`);
    }
    console.log('');
    console.log('Protected data after cleanup:', JSON.stringify(protectedRes.rows[0]));
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('CLEANUP FAILED - transaction rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
