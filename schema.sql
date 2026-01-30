-- deja: persistent memory for agents

CREATE TABLE IF NOT EXISTS learnings (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  learning TEXT NOT NULL,
  reason TEXT,
  confidence REAL DEFAULT 1.0,
  source TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learnings_trigger ON learnings(trigger);
CREATE INDEX IF NOT EXISTS idx_learnings_confidence ON learnings(confidence);
CREATE INDEX IF NOT EXISTS idx_learnings_created_at ON learnings(created_at);
