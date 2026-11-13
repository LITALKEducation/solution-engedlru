-- QR check system (/qrcheck/): admin-defined checks ("ตรวจครั้งที่ 1", "ตรวจสอบป้ายกับ AKA", …), one result per student per check,
-- and the officers allowed to record results. Student data itself comes from the HR tables (camp_students / camp_selections).
CREATE TABLE IF NOT EXISTS camp_qr_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'manual',            -- manual | aka (badge compared with the future AKA system)
  require_registered INTEGER NOT NULL DEFAULT 0,  -- 1 = the student must already have chosen a department
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS camp_qr_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id INTEGER NOT NULL REFERENCES camp_qr_checks(id),
  student_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass','fail')),
  note TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',             -- e.g. the AKA badge code
  checked_by TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  updated_at TEXT,
  UNIQUE (check_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_camp_qr_results_student ON camp_qr_results(student_id);
CREATE TABLE IF NOT EXISTS camp_qr_officers (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO camp_qr_checks (name, description, kind, require_registered, sort_order) VALUES
  ('ตรวจครั้งที่ 1', 'ตรวจ QR และข้อมูลนักศึกษาจากฐานข้อมูลลงทะเบียน', 'manual', 1, 1),
  ('ตรวจสอบป้ายกับ AKA', 'เทียบป้ายของนักศึกษากับข้อมูลในระบบ AKA (ระบบในอนาคต: ตอนนี้บันทึกผลด้วยมือ)', 'aka', 1, 2);
