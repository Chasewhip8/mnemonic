-- deja: persistent memory for agents

CREATE TABLE IF NOT EXISTS learnings (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  learning TEXT NOT NULL,
  reason TEXT,
  confidence REAL DEFAULT 1.0,
  source TEXT,
  scope TEXT NOT NULL, -- Added for scope support
  embedding TEXT, -- Vector embedding as JSON string
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learnings_trigger ON learnings(trigger);
CREATE INDEX IF NOT EXISTS idx_learnings_confidence ON learnings(confidence);
CREATE INDEX IF NOT EXISTS idx_learnings_created_at ON learnings(created_at);
CREATE INDEX IF NOT EXISTS idx_learnings_scope ON learnings(scope);

-- Secrets table (authenticated read/write)
CREATE TABLE IF NOT EXISTS secrets (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  scope TEXT NOT NULL, -- Added for scope support
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_secrets_scope ON secrets(scope);

-- Live working state for active runs/sessions
CREATE TABLE IF NOT EXISTS state_runs (
  run_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  state_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_state_runs_status ON state_runs(status);
CREATE INDEX IF NOT EXISTS idx_state_runs_updated_at ON state_runs(updated_at);

-- Immutable revision history of state changes
CREATE TABLE IF NOT EXISTS state_revisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  change_summary TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_state_revisions_run_id ON state_revisions(run_id);
CREATE INDEX IF NOT EXISTS idx_state_revisions_run_rev ON state_revisions(run_id, revision);

-- Immutable event stream attached to runs
CREATE TABLE IF NOT EXISTS state_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_state_events_run_id ON state_events(run_id);
CREATE INDEX IF NOT EXISTS idx_state_events_created_at ON state_events(created_at);
