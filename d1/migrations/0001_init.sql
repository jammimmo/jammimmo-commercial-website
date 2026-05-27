-- ============================================================================
-- Intake DB schema — Cloudflare D1 (SQLite).
--
-- Backs the vitrine's write surface (leads + property_views). The DB is
-- reachable only via the `INTAKE_DB` binding declared in wrangler.toml; the
-- deployed Worker is the sole code path that can touch it. No HTTP API key
-- on the wire, no anon role to leak, no admin data inside.
--
-- Apply once at bootstrap:
--   wrangler d1 create jammimmo-intake
--   wrangler d1 execute jammimmo-intake --remote --file=d1/migrations/0001_init.sql
--   wrangler d1 execute jammimmo-intake --local  --file=d1/migrations/0001_init.sql
-- ============================================================================

-- --- 1. leads --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id          TEXT PRIMARY KEY,                       -- UUID generated in /api/leads
  property_id TEXT,                                   -- soft ref to admin.properties.id, no FK
  full_name   TEXT NOT NULL CHECK (length(full_name) BETWEEN 1 AND 200),
  phone       TEXT NOT NULL CHECK (length(phone)     BETWEEN 4 AND 32),
  email       TEXT          CHECK (email IS NULL OR length(email) <= 200),
  message     TEXT          CHECK (message IS NULL OR length(message) <= 2000),
  source      TEXT NOT NULL DEFAULT 'vitrine',
  status      TEXT NOT NULL DEFAULT 'nouveau'
              CHECK (status IN ('nouveau','contacté','qualifié','perdu','converti')),
  assigned_to TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS leads_property_idx ON leads (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx   ON leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_created_idx  ON leads (created_at DESC);

-- --- 2. property_views -----------------------------------------------------
CREATE TABLE IF NOT EXISTS property_views (
  id          TEXT PRIMARY KEY,                       -- UUID generated in /api/views
  property_id TEXT NOT NULL,
  viewed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  ip_hash     TEXT,
  country     TEXT,
  referrer    TEXT
);

CREATE INDEX IF NOT EXISTS property_views_property_idx
  ON property_views (property_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS property_views_viewed_idx
  ON property_views (viewed_at DESC);

-- --- 3. mirror tracking ----------------------------------------------------
-- The admin-side sync worker (separate PR) writes here to persist its
-- last-seen cursor between runs.
CREATE TABLE IF NOT EXISTS sync_state (
  table_name      TEXT PRIMARY KEY,
  last_synced_at  TEXT NOT NULL,
  last_synced_id  TEXT
);
INSERT OR IGNORE INTO sync_state (table_name, last_synced_at) VALUES
  ('leads',          '1970-01-01T00:00:00Z'),
  ('property_views', '1970-01-01T00:00:00Z');
