-- Admin notifications about new transactions/donations, per-admin read marker, and Web Push subscriptions.
CREATE TABLE IF NOT EXISTS budget_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('transaction','donation')),
  transaction_uuid TEXT,
  transaction_id TEXT,
  type TEXT,
  amount REAL,
  account_name TEXT,
  title TEXT NOT NULL,
  body TEXT,
  actor_email TEXT NOT NULL,
  actor_name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_notif_created ON budget_notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS budget_notification_state (
  user_uuid TEXT PRIMARY KEY,
  last_read_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  user_uuid TEXT NOT NULL,
  user_email TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_push_user ON budget_push_subscriptions(user_uuid);
