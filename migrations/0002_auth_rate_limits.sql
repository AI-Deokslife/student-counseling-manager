CREATE TABLE auth_rate_limits (
  client_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT
);

CREATE INDEX idx_auth_rate_limits_blocked_until
ON auth_rate_limits(blocked_until);
