-- Required lead quota only. No view/analytics deduplication or retention changes.
CREATE TABLE intake_rate_limits (
  rate_key TEXT PRIMARY KEY CHECK (length(rate_key) BETWEEN 8 AND 160),
  window_started_at INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK (count BETWEEN 1 AND 10001)
);
CREATE INDEX intake_rate_limits_window_idx ON intake_rate_limits (window_started_at);
