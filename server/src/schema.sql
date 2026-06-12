CREATE TABLE IF NOT EXISTS published_workflows (
  id          TEXT PRIMARY KEY,
  author      TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  question    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  view_count  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS published_workflows_created_at_idx
  ON published_workflows (created_at DESC);
