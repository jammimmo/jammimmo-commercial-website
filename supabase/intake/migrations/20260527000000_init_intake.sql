-- ============================================================================
-- Intake DB bootstrap — separate Supabase project from the admin SaaS.
--
-- This project holds ONLY the vitrine's write surface:
--   - leads           : contact form submissions
--   - property_views  : cookie-less view tracking (sha256-truncated IP)
--
-- Cross-project linkage is intentionally soft (property_id is plain UUID
-- with no FK) — we cannot reference admin.properties from a different
-- Supabase project. An admin-side worker pulls rows from here every 60 s
-- and joins them with admin data in the admin DB (separate PR).
--
-- Security posture: anon role can only INSERT. SELECT is reserved for the
-- service_role used by the admin-side sync worker. There is no authenticated
-- user concept on this project.
-- ============================================================================

-- --- 1. leads --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid,             -- soft ref to admin.properties.id, no FK
  full_name   text NOT NULL,
  phone       text NOT NULL,
  email       text,
  message     text,
  source      text NOT NULL DEFAULT 'vitrine',
  status      text NOT NULL DEFAULT 'nouveau'
              CHECK (status IN ('nouveau', 'contacté', 'qualifié', 'perdu', 'converti')),
  assigned_to text,             -- intentionally text, not auth.users FK
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT leads_full_name_length CHECK (char_length(full_name) BETWEEN 1 AND 200),
  CONSTRAINT leads_phone_length     CHECK (char_length(phone)     BETWEEN 4 AND 32),
  CONSTRAINT leads_email_length     CHECK (email IS NULL OR char_length(email) <= 200),
  CONSTRAINT leads_message_length   CHECK (message IS NULL OR char_length(message) <= 2000)
);

CREATE INDEX IF NOT EXISTS leads_property_idx ON public.leads (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx   ON public.leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_created_idx  ON public.leads (created_at DESC);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_anonymous_insert"
  ON public.leads FOR INSERT TO anon WITH CHECK (true);

-- No anon SELECT/UPDATE/DELETE. service_role bypasses RLS for the admin sync.

-- --- 2. property_views -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_views (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid        NOT NULL,
  viewed_at   timestamptz NOT NULL DEFAULT now(),
  ip_hash     text,
  country     text,
  referrer    text
);

CREATE INDEX IF NOT EXISTS property_views_property_idx
  ON public.property_views (property_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS property_views_viewed_idx
  ON public.property_views (viewed_at DESC);

ALTER TABLE public.property_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_views_anonymous_insert"
  ON public.property_views FOR INSERT TO anon WITH CHECK (true);

-- --- 3. Smoke checks -------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'Intake DB bootstrap complete. RLS enabled on leads + property_views.';
END
$$;
