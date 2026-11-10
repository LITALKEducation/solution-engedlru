-- Budget redesign: accounts, categories, users, immutable transactions, evidence and audit trail.
CREATE TABLE IF NOT EXISTS budget_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'THB',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_accounts_active ON budget_accounts(active);

CREATE TABLE IF NOT EXISTS budget_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income','expense','both')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name, type)
);

CREATE TABLE IF NOT EXISTS budget_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  auth0_user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  student_id TEXT,
  display_name TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_users_student ON budget_users(student_id);

CREATE TABLE IF NOT EXISTS budget_account_access (
  user_uuid TEXT NOT NULL,
  account_uuid TEXT NOT NULL,
  PRIMARY KEY(user_uuid, account_uuid),
  FOREIGN KEY(user_uuid) REFERENCES budget_users(uuid),
  FOREIGN KEY(account_uuid) REFERENCES budget_accounts(uuid)
);

CREATE TABLE IF NOT EXISTS budget_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  transaction_id TEXT NOT NULL UNIQUE,
  account_uuid TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income','expense')),
  category_uuid TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  details TEXT NOT NULL,
  note TEXT,
  created_by_auth0_id TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','reversed')),
  reversal_of_uuid TEXT,
  FOREIGN KEY(account_uuid) REFERENCES budget_accounts(uuid),
  FOREIGN KEY(category_uuid) REFERENCES budget_categories(uuid)
);
CREATE INDEX IF NOT EXISTS idx_budget_tx_account_date ON budget_transactions(account_uuid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_budget_tx_created ON budget_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_budget_tx_reversal ON budget_transactions(reversal_of_uuid);

CREATE TABLE IF NOT EXISTS budget_transaction_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  transaction_uuid TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by_auth0_id TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(transaction_uuid) REFERENCES budget_transactions(uuid)
);

CREATE TABLE IF NOT EXISTS budget_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  actor_auth0_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_uuid TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_audit_created ON budget_audit_logs(created_at DESC);

-- Seed safe defaults only if the new tables are empty.
INSERT INTO budget_accounts (uuid, name, description)
SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(6))),
       'บัญชีกลาง', 'บัญชีเริ่มต้นสำหรับระบบ Budget'
WHERE NOT EXISTS (SELECT 1 FROM budget_accounts);

INSERT INTO budget_categories (uuid, name, type)
SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(6))),
       'ค่าใช้จ่ายทั่วไป', 'expense'
WHERE NOT EXISTS (SELECT 1 FROM budget_categories WHERE type='expense');
