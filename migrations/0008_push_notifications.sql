CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE schedule_reminder_deliveries (
  schedule_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (schedule_id, subscription_id),
  FOREIGN KEY (schedule_id) REFERENCES schedules(id),
  FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id)
);

CREATE INDEX idx_push_subscriptions_workspace_user
  ON push_subscriptions(workspace_id, user_email);
