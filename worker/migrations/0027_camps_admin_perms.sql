-- Fine-grained admin permissions. Being an admin at all still comes from the Auth0 role (camp_admin / budget_admin);
-- this table says WHAT an admin may do. perms is a JSON array of scope names (see PERMS in src/handlers/camps.js).
-- While no row holds the "admins" scope the system is in legacy mode: every admin may do everything (nobody is locked out).
CREATE TABLE IF NOT EXISTS camp_admin_perms (
  email TEXT PRIMARY KEY,
  perms TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
