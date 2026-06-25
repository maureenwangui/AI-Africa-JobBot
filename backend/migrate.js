// migrate.js — Run once to add missing columns to existing database
// Usage: node migrate.js
require('dotenv').config();
const getDb = require('./db/connection');

const db = getDb();

console.log('🔧 Running database migration...\n');

const migrations = [
  // Subscriptions table — add payment provider columns
  { col: 'tx_ref',               table: 'subscriptions', sql: 'ALTER TABLE subscriptions ADD COLUMN tx_ref TEXT' },
  { col: 'checkout_request_id',  table: 'subscriptions', sql: 'ALTER TABLE subscriptions ADD COLUMN checkout_request_id TEXT' },
  { col: 'mpesa_receipt',        table: 'subscriptions', sql: 'ALTER TABLE subscriptions ADD COLUMN mpesa_receipt TEXT' },
  { col: 'flw_transaction_id',   table: 'subscriptions', sql: 'ALTER TABLE subscriptions ADD COLUMN flw_transaction_id TEXT' },
  { col: 'amount_paid',          table: 'subscriptions', sql: 'ALTER TABLE subscriptions ADD COLUMN amount_paid REAL' },
  { col: 'currency',             table: 'subscriptions', sql: "ALTER TABLE subscriptions ADD COLUMN currency TEXT DEFAULT 'KES'" },
  { col: 'updated_at',           table: 'subscriptions', sql: "ALTER TABLE subscriptions ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))" },
  // Users table — reset_token for forgot password
  { col: 'reset_token',          table: 'users',         sql: 'ALTER TABLE users ADD COLUMN reset_token TEXT' },
  { col: 'reset_expires',        table: 'users',         sql: 'ALTER TABLE users ADD COLUMN reset_expires TEXT' },
  { col: 'updated_at',           table: 'users',         sql: "ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))" },
];

// Check existing columns helper
function getColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
}

let added = 0;
let skipped = 0;

for (const m of migrations) {
  const cols = getColumns(m.table);
  if (cols.includes(m.col)) {
    console.log(`  ⏭  ${m.table}.${m.col} already exists`);
    skipped++;
  } else {
    try {
      db.prepare(m.sql).run();
      console.log(`  ✅ Added ${m.table}.${m.col}`);
      added++;
    } catch (err) {
      console.error(`  ❌ Failed ${m.table}.${m.col}: ${err.message}`);
    }
  }
}

// Create payments log table if missing
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS payments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL,
      subscription_id INTEGER,
      provider        TEXT NOT NULL,
      amount          REAL NOT NULL,
      currency        TEXT DEFAULT 'KES',
      status          TEXT NOT NULL DEFAULT 'pending',
      reference       TEXT,
      metadata        TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  console.log('  ✅ payments table ready');
} catch (err) {
  console.log('  ⏭  payments table already exists');
}

console.log(`\n✅ Migration complete: ${added} columns added, ${skipped} already existed`);
console.log('\nRestart your server: node server.js\n');