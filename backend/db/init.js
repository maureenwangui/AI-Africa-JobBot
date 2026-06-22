// db/init.js — Africa JobBot Database Schema
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './db/jobbot.sqlite';
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- ─── USERS ────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    name        TEXT,
    phone       TEXT,
    plan        TEXT    NOT NULL DEFAULT 'free',
    subscription_status TEXT NOT NULL DEFAULT 'inactive',
    role        TEXT    NOT NULL DEFAULT 'user',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ─── PROFILES ─────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS profiles (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL UNIQUE,
    cv_filename     TEXT,
    cv_text         TEXT,
    skills          TEXT,
    experience      TEXT,
    education       TEXT,
    keywords        TEXT,
    preferred_roles TEXT,
    preferred_location TEXT DEFAULT 'Nairobi, Kenya',
    remote_preference INTEGER DEFAULT 1,
    summary         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ─── JOBS ─────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS jobs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    company      TEXT NOT NULL,
    location     TEXT,
    remote       INTEGER DEFAULT 0,
    description  TEXT,
    requirements TEXT,
    salary       TEXT,
    job_url      TEXT,
    source       TEXT,
    apply_email  TEXT,
    apply_url    TEXT,
    posted_at    TEXT,
    expires_at   TEXT,
    is_active    INTEGER DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ─── APPLICATIONS ─────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS applications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    job_id       INTEGER NOT NULL,
    match_score  REAL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'queued',
    cover_letter TEXT,
    cv_used      TEXT,
    applied_at   TEXT,
    viewed_at    TEXT,
    response     TEXT,
    notes        TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id)  REFERENCES jobs(id)  ON DELETE CASCADE
  );

  -- ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS subscriptions (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id               INTEGER NOT NULL,
    plan                  TEXT NOT NULL,
    billing_cycle         TEXT NOT NULL DEFAULT 'monthly',
    provider              TEXT NOT NULL DEFAULT 'flutterwave',
    status                TEXT NOT NULL DEFAULT 'pending',
    -- M-Pesa fields
    checkout_request_id   TEXT,
    mpesa_receipt         TEXT,
    -- Flutterwave fields
    tx_ref                TEXT UNIQUE,
    flw_transaction_id    TEXT,
    -- Common fields
    start_date            TEXT,
    end_date              TEXT,
    amount                REAL,
    amount_paid           REAL,
    currency              TEXT DEFAULT 'KES',
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ─── PAYMENTS LOG ──────────────────────────────────────────────────────────
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
  );

  -- ─── USAGE LIMITS ─────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS usage_limits (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL,
    month             TEXT NOT NULL,
    applications_used INTEGER DEFAULT 0,
    cv_used           INTEGER DEFAULT 0,
    cover_letters_used INTEGER DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, month),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ─── NOTIFICATIONS ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    type       TEXT NOT NULL,
    channel    TEXT NOT NULL DEFAULT 'email',
    title      TEXT,
    message    TEXT NOT NULL,
    is_read    INTEGER DEFAULT 0,
    sent_at    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ─── INDEXES ──────────────────────────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_applications_user  ON applications(user_id);
  CREATE INDEX IF NOT EXISTS idx_applications_job   ON applications(job_id);
  CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_active        ON jobs(is_active);
  CREATE INDEX IF NOT EXISTS idx_usage_user_month   ON usage_limits(user_id, month);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
`);

console.log('✅ Africa JobBot database initialized at:', DB_PATH);
module.exports = db;