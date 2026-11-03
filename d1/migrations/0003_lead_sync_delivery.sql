-- Additive lead delivery prerequisite. 0002_chat.sql remains unchanged.
-- Mirror reads pending rows; source idempotency makes a pre-ACK retry safe.
ALTER TABLE leads ADD COLUMN synced_at TEXT;
ALTER TABLE leads ADD COLUMN last_sync_attempt_at TEXT;
ALTER TABLE leads ADD COLUMN last_sync_error_code TEXT;
ALTER TABLE leads ADD COLUMN sync_attempts INTEGER NOT NULL DEFAULT 0 CHECK (sync_attempts >= 0);
CREATE INDEX leads_sync_pending_idx ON leads (created_at, id) WHERE synced_at IS NULL;
-- Existing management cleanup policy remains separately gated: no job enabled here.
CREATE INDEX leads_sync_ack_idx ON leads (synced_at, id) WHERE synced_at IS NOT NULL;
