// Consolidated D1 schema for tests: final shape after schema.sql + schema-admin.sql + schema-admin2.sql.
// Keep in sync with worker/schema*.sql when the production migrations change.
const TABLES = [
  "token_records",
  "token_activities",
  "checkup_logs",
  "checkup_students",
  "checkup_schedule",
  "budget_entries",
  "admin_users",
  "checkin_qr_tokens"
];

const CREATE_STATEMENTS = [
  `CREATE TABLE token_activities (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE token_records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_name  TEXT NOT NULL,
    student_id     TEXT NOT NULL,
    student_name   TEXT,
    student_group  TEXT,
    code           TEXT,
    token          TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX idx_token_records_lookup ON token_records (activity_name, student_id)`,
  `CREATE TABLE checkup_schedule (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL,
    open_at  TEXT NOT NULL,
    close_at TEXT NOT NULL,
    lat      REAL,
    lng      REAL,
    radius_m INTEGER NOT NULL DEFAULT 100
  )`,
  `CREATE TABLE checkup_students (
    student_id TEXT PRIMARY KEY,
    name       TEXT
  )`,
  `CREATE TABLE checkup_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    student_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    lat         REAL,
    lng         REAL,
    distance    INTEGER,
    map_link    TEXT,
    schedule_id INTEGER,
    method      TEXT NOT NULL DEFAULT 'gps'
  )`,
  `CREATE TABLE budget_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    entry_date TEXT NOT NULL,
    category   TEXT NOT NULL,
    details    TEXT,
    qty        REAL,
    price      REAL,
    total      REAL,
    note       TEXT,
    file_key   TEXT,
    file_name  TEXT,
    file_mime  TEXT
  )`,
  `CREATE TABLE admin_users (
    email      TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE checkin_qr_tokens (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL UNIQUE,
    student_id    TEXT NOT NULL,
    student_name  TEXT NOT NULL,
    schedule_id   INTEGER NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at    TEXT NOT NULL,
    used_at       TEXT,
    used_by_admin TEXT
  )`,
  `CREATE INDEX idx_qr_tokens_code ON checkin_qr_tokens (code)`
];

// Drops and recreates every table so each test starts from a known-empty state,
// regardless of whether the pool's storage isolation carries rows between tests.
export async function resetDb(env) {
  for (const table of TABLES) {
    await env.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
  }
  for (const stmt of CREATE_STATEMENTS) {
    await env.DB.prepare(stmt).run();
  }
}
