-- Short-lived rows for the worker-run Auth0 login (/auth/*): PKCE state (10 min) and one-time exchange codes (2 min).
CREATE TABLE IF NOT EXISTS auth_tmp (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  data TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_tmp_exp ON auth_tmp(expires_at);
