-- School survey form ("แบบสำรวจโรงเรียน") filled in by an admin on behalf of a student, using the checklist of that student's ฝ่าย.
-- One form per student. checks / notes are JSON arrays with one entry per checklist item (see src/lib/survey-forms.js).
CREATE TABLE IF NOT EXISTS camp_school_survey (
  student_id TEXT PRIMARY KEY,
  department_code TEXT NOT NULL,
  school_name TEXT NOT NULL DEFAULT '',
  survey_date TEXT NOT NULL DEFAULT '',
  coordinator TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  checks TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  surveyor TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
