#!/usr/bin/env node
/**
 * Pre-cleanup snapshot backup (heightt-backend)
 *
 * Dumps every row of every public table to
 *   backups/pre-cleanup-<timestamp>/<table>.json
 * plus a summary.json with row counts. Pure SELECT reads, no writes.
 *
 * Usage:
 *   node scripts/backup-prod.js [--out <dir>]
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

const args = process.argv.slice(2);
const outArgIdx = args.indexOf('--out');
const outDir = outArgIdx >= 0 ? args[outArgIdx + 1] : null;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = outDir || path.resolve(__dirname, '..', 'backups', `pre-cleanup-${ts}`);
    fs.mkdirSync(dir, { recursive: true });

    const tablesRes = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
        ORDER BY table_name`,
    );
    const tables = tablesRes.rows.map((r) => r.table_name);

    const summary = { timestamp: new Date().toISOString(), tables: {} };
    for (const t of tables) {
      const res = await client.query(`SELECT * FROM "${t}"`);
      const rows = res.rows;
      summary.tables[t] = rows.length;
      fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(rows, null, 2));
      console.log(`  ${String(t).padEnd(30)} ${String(rows.length).padStart(6)} rows`);
    }

    fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log('');
    console.log(`Backup written to ${dir}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('BACKUP FAILED:', err.message);
  process.exit(1);
});