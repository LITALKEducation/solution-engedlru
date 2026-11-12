-- Camps / ฝ่ายบุคคล: departments, per-year quotas, student roster and one selection per student.
CREATE TABLE IF NOT EXISTS camp_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- registration_state: pending (เร็วๆ นี้) | open | closed
INSERT OR IGNORE INTO camp_settings (key, value) VALUES ('registration_state', 'pending');

CREATE TABLE IF NOT EXISTS camp_departments (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO camp_departments (code, name, description, sort_order) VALUES
  ('direction', 'ฝ่ายอำนวยการ', 'ฝ่ายสำหรับการควบคุมและอำนวยการค่ายทั้งหมด', 1),
  ('structure', 'ฝ่ายโครงสร้าง', 'ซ่อมแซม ตกแต่ง และทาสีโรงเรียน', 2),
  ('community', 'ฝ่ายสัมพันธ์ชุมชน', 'การสร้างความสัมพันธ์กับชุมชน เรียนรู้วัฒนธรรม', 3),
  ('teaching', 'ฝ่ายการสอน', 'สอนนักเรียนให้มีความรู้', 4),
  ('welfare', 'ฝ่ายสวัสดิการ', 'ทำอาหาร น้ำ และอำนวยความสะดวกเกี่ยวกับอาหารแก่นักศึกษาตลอดกิจกรรมค่าย', 5);

CREATE TABLE IF NOT EXISTS camp_quotas (
  department_code TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 4),
  quota INTEGER NOT NULL DEFAULT 0 CHECK (quota >= 0),
  PRIMARY KEY (department_code, year)
);

CREATE TABLE IF NOT EXISTS camp_students (
  student_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 4),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_camp_students_year ON camp_students(year);

-- One selection per student. `year` is copied from the roster so slots can be counted with one query.
CREATE TABLE IF NOT EXISTS camp_selections (
  student_id TEXT PRIMARY KEY,
  department_code TEXT NOT NULL,
  year INTEGER NOT NULL,
  selected_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_camp_selections_dept ON camp_selections(department_code, year);
