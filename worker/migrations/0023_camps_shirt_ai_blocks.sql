-- Camp shirt: a student whose upload is judged AI-generated ('likely' in the AI check, migration 0022) is locked out of uploading for 24 hours.
-- until = epoch milliseconds; an admin can lift a block early (false positive).
CREATE TABLE IF NOT EXISTS camp_shirt_blocks (
  student_id TEXT PRIMARY KEY,
  until INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
