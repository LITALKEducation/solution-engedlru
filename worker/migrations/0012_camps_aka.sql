-- AKA: the camp name (and nickname) every student gives themselves. People and departments come from the HR tables.
-- Naming stays open (students may change it any time) until an admin closes it: camp_settings key aka_state = open | closed (default open).
CREATE TABLE IF NOT EXISTS camp_aka (
  student_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL DEFAULT '',
  aka TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO camp_settings (key, value) VALUES ('aka_state', 'open');
