-- Students an admin has assigned to fill in their ฝ่าย's school-survey form themselves (public page /hr/survey, sign-in with @lru.ac.th).
CREATE TABLE IF NOT EXISTS camp_survey_assignees (
  student_id TEXT PRIMARY KEY,
  assigned_by TEXT,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now'))
);
