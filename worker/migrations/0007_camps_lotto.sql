-- Camps lottery roster and one-time check-in.
CREATE TABLE IF NOT EXISTS camp_lotto_students (
  student_id TEXT PRIMARY KEY,
  student_name TEXT NOT NULL,
  draw_number TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  checked_at TEXT,
  checked_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_camp_lotto_draw_number ON camp_lotto_students(draw_number);
CREATE INDEX IF NOT EXISTS idx_camp_lotto_checked_at ON camp_lotto_students(checked_at);
CREATE TABLE IF NOT EXISTS camp_lotto_scan_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  draw_number TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'checked',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_camp_lotto_scan_logs_student ON camp_lotto_scan_logs(student_id, created_at);
