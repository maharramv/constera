BEGIN;

CREATE TABLE IF NOT EXISTS project_site_daily_logs (
  id text PRIMARY KEY,
  log_number bigserial UNIQUE,
  project_id text NOT NULL REFERENCES customer_projects(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  shift text NOT NULL DEFAULT 'day' CHECK (shift IN ('day', 'night')),
  weather text NOT NULL DEFAULT 'clear' CHECK (weather IN ('clear', 'cloudy', 'rain', 'wind', 'hot', 'cold')),
  weather_note text,
  crew_name text NOT NULL,
  supervisor_name text,
  worker_count integer NOT NULL DEFAULT 0 CHECK (worker_count BETWEEN 0 AND 5000),
  worker_hours numeric(12, 2) NOT NULL DEFAULT 0 CHECK (worker_hours BETWEEN 0 AND 100000),
  work_summary text NOT NULL,
  equipment_note text,
  equipment_hours numeric(12, 2) NOT NULL DEFAULT 0 CHECK (equipment_hours BETWEEN 0 AND 100000),
  delay_minutes integer NOT NULL DEFAULT 0 CHECK (delay_minutes BETWEEN 0 AND 1000000),
  delay_reason text,
  safety_note text,
  photo_asset_id text REFERENCES media_assets(id) ON DELETE SET NULL,
  recorded_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_quality_issues (
  id text PRIMARY KEY,
  issue_number bigserial UNIQUE,
  issue_code text NOT NULL UNIQUE,
  project_id text NOT NULL REFERENCES customer_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'verified')),
  work_area text,
  description text,
  due_date date,
  assignee_name text,
  photo_asset_id text REFERENCES media_assets(id) ON DELETE SET NULL,
  reported_by text REFERENCES users(id) ON DELETE SET NULL,
  resolved_by text REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_control_documents (
  id text PRIMARY KEY,
  document_number bigserial UNIQUE,
  document_code text NOT NULL UNIQUE,
  project_id text NOT NULL REFERENCES customer_projects(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN ('hidden_work', 'inspection', 'handover', 'drawing_revision')),
  title text NOT NULL,
  work_area text,
  inspection_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'accepted', 'rejected', 'superseded')),
  revision_code text,
  specification text,
  inspector_name text,
  contractor_name text,
  media_asset_id text REFERENCES media_assets(id) ON DELETE SET NULL,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  approved_by text REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_site_daily_logs_project_idx
  ON project_site_daily_logs (project_id, work_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS project_quality_issues_project_idx
  ON project_quality_issues (project_id, status, due_date, created_at DESC);
CREATE INDEX IF NOT EXISTS project_control_documents_project_idx
  ON project_control_documents (project_id, record_type, inspection_date DESC);

COMMIT;
