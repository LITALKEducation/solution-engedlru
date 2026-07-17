-- Migration: Admin Dashboard (checkin-by-activity, per-activity coordinates,
-- QR self-checkin, token CSV import, DB-backed admin list)
-- รันหลัง schema.sql เท่านั้น (ต้องมีตาราง checkup_schedule/checkup_logs อยู่แล้ว)

ALTER TABLE checkup_schedule ADD COLUMN lat REAL;
ALTER TABLE checkup_schedule ADD COLUMN lng REAL;
ALTER TABLE checkup_schedule ADD COLUMN radius_m INTEGER NOT NULL DEFAULT 100;

-- ผูกพิกัดเดิม (ค่าคงที่ทั้งระบบ) เข้ากับกิจกรรมที่มีอยู่แล้ว เพื่อไม่ให้ของเดิมพัง
UPDATE checkup_schedule SET lat = 17.5393285, lng = 101.7193514, radius_m = 100 WHERE lat IS NULL;

ALTER TABLE checkup_logs ADD COLUMN schedule_id INTEGER;
ALTER TABLE checkup_logs ADD COLUMN method TEXT NOT NULL DEFAULT 'gps';

CREATE TABLE IF NOT EXISTS admin_users (
  email      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO admin_users (email) VALUES ('sb6740102220@lru.ac.th');

CREATE TABLE IF NOT EXISTS checkin_qr_tokens (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE,
  student_id     TEXT NOT NULL,
  student_name   TEXT NOT NULL,
  schedule_id    INTEGER NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at     TEXT NOT NULL,
  used_at        TEXT,
  used_by_admin  TEXT
);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_code ON checkin_qr_tokens (code);
