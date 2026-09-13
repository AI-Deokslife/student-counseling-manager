PRAGMA foreign_keys = ON;

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  current_school_year INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  access_email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'teacher', 'readonly')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE students (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  parent_phone TEXT,
  photo_key TEXT,
  memo TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'graduated', 'transferred', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE student_enrollments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  school_year INTEGER NOT NULL,
  grade INTEGER,
  class_no INTEGER,
  student_no INTEGER,
  enrollment_status TEXT NOT NULL DEFAULT 'enrolled' CHECK(enrollment_status IN ('enrolled', 'graduated', 'transferred', 'withdrawn')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE(student_id, school_year)
);

CREATE TABLE counseling_types (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  UNIQUE(workspace_id, name)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  UNIQUE(workspace_id, name)
);

CREATE TABLE student_tags (
  student_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (student_id, tag_id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE TABLE counseling_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  counseling_type_id TEXT,
  counseling_date TEXT NOT NULL,
  counseling_time TEXT,
  summary TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'normal' CHECK(status IN ('normal', 'monitoring', 'follow_up', 'in_progress', 'completed')),
  follow_up_date TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (counseling_type_id) REFERENCES counseling_types(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE counseling_record_tags (
  counseling_record_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (counseling_record_id, tag_id),
  FOREIGN KEY (counseling_record_id) REFERENCES counseling_records(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  counseling_type_id TEXT,
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'completed', 'cancelled')),
  counseling_record_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (counseling_type_id) REFERENCES counseling_types(id),
  FOREIGN KEY (counseling_record_id) REFERENCES counseling_records(id)
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  student_id TEXT,
  counseling_record_id TEXT,
  storage_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (counseling_record_id) REFERENCES counseling_records(id)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE workspace_settings (
  workspace_id TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX idx_students_workspace ON students(workspace_id, deleted_at);
CREATE INDEX idx_students_favorite ON students(workspace_id, is_favorite, deleted_at);
CREATE INDEX idx_enrollments_school_year ON student_enrollments(workspace_id, school_year, grade, class_no);
CREATE INDEX idx_counseling_student_date ON counseling_records(student_id, counseling_date DESC);
CREATE INDEX idx_counseling_workspace_date ON counseling_records(workspace_id, counseling_date DESC);
CREATE INDEX idx_counseling_follow_up ON counseling_records(workspace_id, follow_up_date, status);
CREATE INDEX idx_schedules_date ON schedules(workspace_id, scheduled_date, status);
CREATE INDEX idx_audit_entity ON audit_logs(workspace_id, entity_type, entity_id, created_at DESC);
