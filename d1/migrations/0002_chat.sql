-- Dedicated chat data; no legacy lead rewrite, public SQL proxy or Supabase dependency.
PRAGMA foreign_keys = ON;
CREATE TABLE chat_settings (
  id TEXT PRIMARY KEY CHECK(id='global'), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  config_json TEXT NOT NULL CHECK(json_valid(config_json)), updated_by TEXT, updated_at TEXT NOT NULL
);
INSERT INTO chat_settings VALUES ('global',1,'{"enabled":false,"welcome":"Bonjour, je vous aide à trouver une information sur Jamm Immo.","operatorIds":[],"routing":{"property":[],"tools":[],"services":[],"other":[]},"schedule":{"timezone":"Africa/Dakar","days":[1,2,3,4,5,6],"start":"09:00","end":"18:00"},"notificationEmailEnabled":false,"files":{"enabled":false,"maxCount":3,"maxBytes":5242880,"totalBytes":15728640},"retentionDays":30,"aiEnabled":false,"dailyNeurons":6000,"sourceIds":[]}',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY, cap_hash TEXT NOT NULL UNIQUE, network_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX chat_sessions_expiry ON chat_sessions(expires_at);
CREATE TABLE chat_conversations (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE REFERENCES chat_sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'bot' CHECK(status IN ('bot','waiting','assigned','waiting_visitor','closed')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), name TEXT, channel TEXT CHECK(channel IN ('email','phone','chat')),
  contact TEXT, summary TEXT, topic TEXT CHECK(topic IN ('property','tools','services','other')),
  consented_at TEXT, assigned_to TEXT, receipt_id TEXT UNIQUE, inbox_available_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX chat_conversations_queue ON chat_conversations(status,updated_at,id);
CREATE INDEX chat_conversations_owner ON chat_conversations(assigned_to,status,updated_at,id);
CREATE INDEX chat_conversations_expiry ON chat_conversations(expires_at);
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  request_id TEXT, role TEXT NOT NULL CHECK(role IN ('visitor','assistant','operator','system')),
  content TEXT NOT NULL CHECK(length(content)<=4000), citations_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(citations_json)),
  created_at TEXT NOT NULL, UNIQUE(conversation_id,request_id,role)
);
CREATE INDEX chat_messages_thread ON chat_messages(conversation_id,created_at,id);
CREATE TABLE chat_requests (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('message','handoff','attachment','claim','reply','assign','close')),
  body_hash TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'processing' CHECK(state IN ('processing','complete','uncertain','failed')),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  ai_state TEXT NOT NULL DEFAULT 'not_reserved' CHECK(ai_state IN ('not_reserved','reserved','used','unknown','skipped')),
  ai_reserved_units INTEGER NOT NULL DEFAULT 0 CHECK(ai_reserved_units>=0),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(conversation_id,request_id)
);
CREATE UNIQUE INDEX chat_message_singleflight ON chat_requests(conversation_id) WHERE kind='message' AND state='processing';
CREATE TABLE chat_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL CHECK(count>=0), expires_at TEXT NOT NULL);
CREATE INDEX chat_limits_expiry ON chat_limits(expires_at);
CREATE TABLE chat_scanners (
  id TEXT PRIMARY KEY, public_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  engine_version TEXT NOT NULL, signatures_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at INTEGER NOT NULL
);
CREATE TABLE chat_scanner_nonces (scanner_id TEXT NOT NULL REFERENCES chat_scanners(id) ON DELETE CASCADE, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(scanner_id,nonce));
CREATE INDEX chat_scanner_nonces_expiry ON chat_scanner_nonces(expires_at);
CREATE UNIQUE INDEX chat_scanner_single_active ON chat_scanners(status) WHERE status='active';
CREATE TABLE chat_attachments (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL, name TEXT NOT NULL CHECK(length(name)<=180), content_type TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size>0 AND size<=5242880), actual_size INTEGER,
  state TEXT NOT NULL CHECK(state IN ('reserved','uploading','quarantined','scanning','clean','rejected','scan_failed','deleted')),
  object_key TEXT NOT NULL UNIQUE, sha256 TEXT, scan_sha256 TEXT,
  scan_verdict TEXT CHECK(scan_verdict IN ('clean','infected','error')), scanner_id TEXT,
  scanner_version TEXT, scanner_signatures_at TEXT, scanned_at TEXT,
  scan_lease_id TEXT, scan_lease_until TEXT, scan_attempts INTEGER NOT NULL DEFAULT 0,
  scan_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  UNIQUE(conversation_id,request_id),
  CHECK(state<>'clean' OR (sha256 IS NOT NULL AND length(sha256)=64 AND sha256 NOT GLOB '*[^a-f0-9]*' AND scan_sha256 IS NOT NULL AND scan_sha256=sha256 AND scan_verdict IS NOT NULL AND scan_verdict='clean' AND actual_size IS NOT NULL AND actual_size=size AND scanned_at IS NOT NULL AND scanner_id IS NOT NULL AND scanner_version IS NOT NULL AND scanner_signatures_at IS NOT NULL))
);
CREATE INDEX chat_attachments_thread ON chat_attachments(conversation_id,created_at,id);
CREATE INDEX chat_attachments_scan ON chat_attachments(state,scan_lease_until,created_at,id);
-- Audit and outbox share a durable identity. payload_json is never included in public DTOs.
CREATE TABLE chat_events (
  id TEXT PRIMARY KEY, conversation_id TEXT REFERENCES chat_conversations(id) ON DELETE CASCADE,
  request_id TEXT, kind TEXT NOT NULL, actor_id TEXT, payload_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded','pending','sending','sent','failed','unknown','unconfigured')),
  dedupe_key TEXT NOT NULL UNIQUE, recipient_id TEXT, provider_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0, lease_id TEXT, lease_until TEXT, last_error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX chat_events_outbox ON chat_events(status,kind,created_at,id);
CREATE INDEX chat_events_notification_due ON chat_events(status,kind,lease_until,updated_at,id);
CREATE INDEX chat_events_thread ON chat_events(conversation_id,created_at,id);
-- AFTER triggers run only for an inserted row, never for an idempotent conflict.
CREATE TRIGGER chat_session_admission AFTER INSERT ON chat_sessions BEGIN
  INSERT INTO chat_limits VALUES('session:network:'||NEW.network_hash||':'||strftime('%Y-%m-%dT%H','now'),1,strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 hours'))
    ON CONFLICT(key) DO UPDATE SET count=count+1;
  SELECT CASE WHEN (SELECT count FROM chat_limits WHERE key='session:network:'||NEW.network_hash||':'||strftime('%Y-%m-%dT%H','now'))>12 THEN RAISE(ABORT,'chat_session_limit') END;
  INSERT INTO chat_limits VALUES('session:global:'||date('now'),1,strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 days')) ON CONFLICT(key) DO UPDATE SET count=count+1;
  SELECT CASE WHEN (SELECT count FROM chat_limits WHERE key='session:global:'||date('now'))>1000 THEN RAISE(ABORT,'chat_session_limit') END;
END;
CREATE TRIGGER chat_all_request_admission AFTER INSERT ON chat_requests BEGIN
  INSERT INTO chat_limits VALUES('request:conversation:'||NEW.conversation_id||':'||date('now'),1,strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 days'))
    ON CONFLICT(key) DO UPDATE SET count=count+1;
  SELECT CASE WHEN (SELECT count FROM chat_limits WHERE key='request:conversation:'||NEW.conversation_id||':'||date('now'))>200 THEN RAISE(ABORT,'chat_request_limit') END;
  INSERT INTO chat_limits VALUES('request:global:'||date('now'),1,strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 days'))
    ON CONFLICT(key) DO UPDATE SET count=count+1;
  SELECT CASE WHEN (SELECT count FROM chat_limits WHERE key='request:global:'||date('now'))>8000 THEN RAISE(ABORT,'chat_request_limit') END;
END;
CREATE TRIGGER chat_request_admission AFTER INSERT ON chat_requests WHEN NEW.kind='message' BEGIN
  SELECT CASE WHEN (SELECT count(*) FROM chat_messages WHERE conversation_id=NEW.conversation_id AND role='visitor')>=100 THEN RAISE(ABORT,'chat_thread_limit') END;
  INSERT INTO chat_limits VALUES('message:'||NEW.conversation_id||':'||strftime('%Y-%m-%dT%H:%M','now'),1,strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 hours')) ON CONFLICT(key) DO UPDATE SET count=count+1;
  SELECT CASE WHEN (SELECT count FROM chat_limits WHERE key='message:'||NEW.conversation_id||':'||strftime('%Y-%m-%dT%H:%M','now'))>6 THEN RAISE(ABORT,'chat_message_limit') END;
  INSERT INTO chat_limits VALUES('message:global:'||date('now'),1,strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 days')) ON CONFLICT(key) DO UPDATE SET count=count+1;
  SELECT CASE WHEN (SELECT count FROM chat_limits WHERE key='message:global:'||date('now'))>5000 THEN RAISE(ABORT,'chat_message_limit') END;
END;
CREATE TRIGGER chat_ai_admission BEFORE UPDATE OF ai_state ON chat_requests
WHEN NEW.ai_state='reserved' AND OLD.ai_state='not_reserved' BEGIN
  SELECT CASE WHEN (SELECT status FROM chat_conversations WHERE id=NEW.conversation_id)<>'bot'
    OR coalesce((SELECT json_extract(config_json,'$.enabled') FROM chat_settings WHERE id='global'),0)<>1
    OR coalesce((SELECT json_extract(config_json,'$.aiEnabled') FROM chat_settings WHERE id='global'),0)<>1 THEN RAISE(ABORT,'chat_ai_disabled') END;
  SELECT CASE WHEN NEW.ai_reserved_units<=0 OR NEW.ai_reserved_units>100000 THEN RAISE(ABORT,'chat_ai_units') END;
  INSERT INTO chat_limits VALUES('ai:'||date('now'),NEW.ai_reserved_units,strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 days')) ON CONFLICT(key) DO UPDATE SET count=count+excluded.count;
  SELECT CASE WHEN (SELECT count FROM chat_limits WHERE key='ai:'||date('now'))>min(8000,coalesce((SELECT CAST(json_extract(config_json,'$.dailyNeurons') AS INTEGER) FROM chat_settings WHERE id='global'),0))*1000 THEN RAISE(ABORT,'chat_ai_budget') END;
END;
CREATE TRIGGER chat_attachment_admission BEFORE INSERT ON chat_attachments BEGIN
  SELECT CASE WHEN NEW.size>min(5242880,coalesce((SELECT CAST(json_extract(config_json,'$.files.maxBytes') AS INTEGER) FROM chat_settings WHERE id='global'),0)) THEN RAISE(ABORT,'chat_attachment_bytes') END;
  SELECT CASE WHEN (SELECT count(*) FROM chat_attachments WHERE conversation_id=NEW.conversation_id AND state<>'deleted')>=min(3,coalesce((SELECT CAST(json_extract(config_json,'$.files.maxCount') AS INTEGER) FROM chat_settings WHERE id='global'),0)) THEN RAISE(ABORT,'chat_attachment_count') END;
  SELECT CASE WHEN coalesce((SELECT sum(size) FROM chat_attachments WHERE conversation_id=NEW.conversation_id AND state<>'deleted'),0)+NEW.size>min(15728640,coalesce((SELECT CAST(json_extract(config_json,'$.files.totalBytes') AS INTEGER) FROM chat_settings WHERE id='global'),0)) THEN RAISE(ABORT,'chat_attachment_bytes') END;
END;
-- Reserve the global storage budget in the same transaction as the new row.
-- AFTER INSERT excludes idempotent conflicts. Scan failure/deletion never refunds
-- an uncertain reservation; the UTC day key resets only on the next day.
CREATE TRIGGER chat_attachment_global_admission AFTER INSERT ON chat_attachments BEGIN
  INSERT INTO chat_limits VALUES('attachment:bytes:global:'||date('now'),NEW.size,strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 days'))
    ON CONFLICT(key) DO UPDATE SET count=count+excluded.count;
  SELECT CASE WHEN (SELECT count FROM chat_limits WHERE key='attachment:bytes:global:'||date('now'))>104857600 THEN RAISE(ABORT,'chat_attachment_daily_bytes') END;
END;
