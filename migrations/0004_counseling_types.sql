INSERT OR IGNORE INTO counseling_types (id, workspace_id, name, color, sort_order, is_active, created_at, updated_at)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), id, '학교생활', '#00AFAE', 10, 1, datetime('now'), datetime('now') FROM workspaces;

INSERT OR IGNORE INTO counseling_types (id, workspace_id, name, color, sort_order, is_active, created_at, updated_at)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), id, '학업·진로', '#2563EB', 20, 1, datetime('now'), datetime('now') FROM workspaces;

INSERT OR IGNORE INTO counseling_types (id, workspace_id, name, color, sort_order, is_active, created_at, updated_at)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), id, '교우관계', '#7C3AED', 30, 1, datetime('now'), datetime('now') FROM workspaces;

INSERT OR IGNORE INTO counseling_types (id, workspace_id, name, color, sort_order, is_active, created_at, updated_at)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), id, '정서·생활', '#E11D48', 40, 1, datetime('now'), datetime('now') FROM workspaces;

INSERT OR IGNORE INTO counseling_types (id, workspace_id, name, color, sort_order, is_active, created_at, updated_at)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), id, '보호자 상담', '#D97706', 50, 1, datetime('now'), datetime('now') FROM workspaces;

INSERT OR IGNORE INTO counseling_types (id, workspace_id, name, color, sort_order, is_active, created_at, updated_at)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), id, '기타', '#4B5563', 60, 1, datetime('now'), datetime('now') FROM workspaces;

UPDATE counseling_records
SET counseling_type_id = (
  SELECT counseling_types.id
  FROM counseling_types
  WHERE counseling_types.workspace_id = counseling_records.workspace_id
    AND counseling_types.name = '학교생활'
)
WHERE counseling_type_id IS NULL;
