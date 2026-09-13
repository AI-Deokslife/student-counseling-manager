INSERT INTO admin_credentials (id, password_hash, updated_at, updated_by)
VALUES ('primary', '$2b$12$IT7s3hKbUYWF5PtpepdesOqgjSAVBfP1LyO/Dql2qNI6MEjOUjEzu', CURRENT_TIMESTAMP, 'system_reset')
ON CONFLICT(id) DO UPDATE SET
  password_hash = excluded.password_hash,
  updated_at = excluded.updated_at,
  updated_by = excluded.updated_by;
