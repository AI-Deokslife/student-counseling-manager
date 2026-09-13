CREATE TABLE backup_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  backup_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX idx_backup_snapshots_workspace ON backup_snapshots(workspace_id, created_at DESC);
