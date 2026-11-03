-- Public narrative cache only. No Supabase/client/lead/financial data changes.
CREATE TABLE listing_translations (
  reference TEXT NOT NULL CHECK(length(reference) BETWEEN 1 AND 200),
  source_hash TEXT NOT NULL CHECK(length(source_hash)=64 AND source_hash NOT GLOB '*[^0-9a-f]*'),
  locale TEXT NOT NULL CHECK(locale IN ('en','wo','es','it','ar')),
  model TEXT NOT NULL,
  policy TEXT NOT NULL,
  source_json TEXT NOT NULL CHECK(json_valid(source_json)),
  is_current INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0,1)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','ready')),
  translation_json TEXT CHECK(translation_json IS NULL OR json_valid(translation_json)),
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  not_before INTEGER NOT NULL DEFAULT 0,
  attempt_day TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 1),
  revalidation_pending INTEGER NOT NULL DEFAULT 0 CHECK(revalidation_pending IN (0,1)),
  requested_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(reference,source_hash,locale,model,policy),
  CHECK((state='ready' AND translation_json IS NOT NULL) OR (state<>'ready' AND translation_json IS NULL))
);
CREATE INDEX listing_translations_pending ON listing_translations(model,policy,is_current,state,not_before,requested_at);
CREATE TABLE listing_translation_reservations (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  locale TEXT NOT NULL,
  model TEXT NOT NULL,
  policy TEXT NOT NULL,
  day TEXT NOT NULL CHECK(length(day)=10),
  neurons INTEGER NOT NULL CHECK(neurons>0),
  created_at INTEGER NOT NULL
);
CREATE INDEX listing_translation_budget_day ON listing_translation_reservations(day,neurons);
-- A timeout or unknown AI result never refunds a reservation. No pruning or
-- alternate spend ledger is part of this finite feature.
CREATE TRIGGER listing_translation_reservation_immutable_update BEFORE UPDATE ON listing_translation_reservations
BEGIN SELECT RAISE(ABORT,'listing_translation_reservation_immutable'); END;
CREATE TRIGGER listing_translation_reservation_immutable_delete BEFORE DELETE ON listing_translation_reservations
BEGIN SELECT RAISE(ABORT,'listing_translation_reservation_immutable'); END;
