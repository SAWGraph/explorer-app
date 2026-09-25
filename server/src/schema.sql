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

ALTER TABLE published_workflows
  ADD COLUMN IF NOT EXISTS edit_token_hash TEXT;

-- Cached pipeline results. Written only by trusted paths: the publisher (via
-- their editToken) and the warm-cache script (via CACHE_WRITE_TOKEN). Reads are
-- public. Keys are namespaced: 'publish:<id>' or 'q:<sha256 of the question>'.
CREATE TABLE IF NOT EXISTS query_results (
  cache_key     TEXT PRIMARY KEY,
  question      JSONB NOT NULL,
  payload       BYTEA NOT NULL,
  payload_bytes INTEGER NOT NULL,
  source        TEXT NOT NULL,
  partial       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_hit_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  hit_count     INTEGER NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL
);

-- payload arrives already gzipped; EXTERNAL stops TOAST attempting pglz on top.
ALTER TABLE query_results ALTER COLUMN payload SET STORAGE EXTERNAL;

CREATE INDEX IF NOT EXISTS query_results_expires_at_idx ON query_results (expires_at);

ALTER TABLE published_workflows ADD COLUMN IF NOT EXISTS result_key TEXT;
