-- Camp shirt: students upload a design while submissions are open, then vote while voting is open.
-- The two windows, and whether results are announced, live in camp_settings:
--   shirt_submit_from / shirt_submit_to / shirt_vote_from / shirt_vote_to   epoch milliseconds ('' = not set)
--   shirt_results_public                                                    '1' = students may see the vote counts
-- One design per student; designs get a random id so image URLs cannot be guessed before voting opens.
CREATE TABLE IF NOT EXISTS camp_shirt_designs (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_key TEXT NOT NULL,
  image_mime TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- one vote per student (changeable while voting is open)
CREATE TABLE IF NOT EXISTS camp_shirt_votes (
  student_id TEXT PRIMARY KEY,
  design_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_camp_shirt_votes_design ON camp_shirt_votes(design_id);
