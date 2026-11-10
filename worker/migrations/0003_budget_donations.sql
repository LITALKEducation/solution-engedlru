-- Donation register (cash / PromptPay). Each donation is linked to an income transaction
-- so account balances, reports and evidence files keep working unchanged.
CREATE TABLE IF NOT EXISTS budget_donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  transaction_uuid TEXT NOT NULL UNIQUE,
  account_uuid TEXT NOT NULL,
  donor_name TEXT NOT NULL,
  donor_contact TEXT,
  anonymous INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL CHECK(method IN ('cash','promptpay')),
  amount REAL NOT NULL CHECK(amount > 0),
  donated_at TEXT NOT NULL,
  note TEXT,
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(transaction_uuid) REFERENCES budget_transactions(uuid),
  FOREIGN KEY(account_uuid) REFERENCES budget_accounts(uuid)
);
CREATE INDEX IF NOT EXISTS idx_budget_donations_date ON budget_donations(donated_at DESC);
CREATE INDEX IF NOT EXISTS idx_budget_donations_account ON budget_donations(account_uuid, donated_at DESC);

INSERT OR IGNORE INTO budget_categories (uuid, name, type)
VALUES (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(6))), 'เงินบริจาค', 'income');
