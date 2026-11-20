-- Photos attached to a school-survey form (up to 10 per student). The files live in R2 (key image_key); only the owner and survey admins can open them.
CREATE TABLE IF NOT EXISTS camp_survey_photos (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  image_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  caption TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_camp_survey_photos_student ON camp_survey_photos(student_id);
