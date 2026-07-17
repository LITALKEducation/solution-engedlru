-- D1 schema for solution-engedlru API (replaces Google Sheets backends)

-- ── ระบบค้นหารหัสกิจกรรม / Token Key (sys.html, system.js) ──
CREATE TABLE IF NOT EXISTS token_activities (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS token_records (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_name  TEXT NOT NULL,
  student_id     TEXT NOT NULL,
  student_name   TEXT,
  student_group  TEXT,
  code           TEXT,
  token          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_token_records_lookup ON token_records (activity_name, student_id);

-- ── ระบบเช็คชื่อ GPS (checkup.html) ──
CREATE TABLE IF NOT EXISTS checkup_schedule (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  open_at  TEXT NOT NULL, -- 'YYYY-MM-DD HH:MM'
  close_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkup_students (
  student_id TEXT PRIMARY KEY,
  name       TEXT
);

CREATE TABLE IF NOT EXISTS checkup_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  student_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  lat        REAL NOT NULL,
  lng        REAL NOT NULL,
  distance   INTEGER,
  map_link   TEXT
);

-- ── ระบบงบประมาณโครงการ (budget.html) ──
CREATE TABLE IF NOT EXISTS budget_entries (
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
);
