# Analytics setup — Umami + Microsoft Clarity

This vitrine is fully **wired** for Umami (custom events, ownership) and
Microsoft Clarity (heatmaps + session replay). Both are **off by default** —
they only fire when their `PUBLIC_*` env vars are set on Cloudflare Pages.

There's nothing to change in this codebase. The steps below are the one-time
operational setup.

---

## 1. Create the isolated Umami schema in Supabase

Goal: a `umami` schema and a dedicated `umami_user` Postgres role that **has
zero access** to `public.properties` / `public.leads`. Even if Umami is fully
compromised, the blast radius is the analytics tables only.

In the Supabase SQL Editor of project `ygaawqgwxlbtkcuqecxh`:

```sql
-- Schema for Umami v2 to populate during its first boot.
CREATE SCHEMA IF NOT EXISTS umami;

-- Dedicated role for Umami — replace the password with a strong random one.
CREATE ROLE umami_user WITH LOGIN PASSWORD 'REPLACE_WITH_STRONG_RANDOM';

-- Grant access ONLY to the umami schema.
GRANT USAGE, CREATE ON SCHEMA umami TO umami_user;
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA umami TO umami_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA umami TO umami_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA umami
  GRANT ALL ON TABLES    TO umami_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA umami
  GRANT ALL ON SEQUENCES TO umami_user;

-- Hard-deny everything in `public` (where properties/leads live).
REVOKE ALL ON SCHEMA public            FROM umami_user;
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM umami_user;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM umami_user;

-- Tell Umami to use its schema by default (search_path).
ALTER ROLE umami_user SET search_path TO umami;
```

Get the Umami connection string:

```
postgresql://umami_user:PASSWORD@db.ygaawqgwxlbtkcuqecxh.supabase.co:5432/postgres?schema=umami
```

(Use Supabase **Connection Pooler / Session mode** if Umami needs persistent
connections — direct port 5432 is fine for low traffic.)

## 2. Deploy Umami at analytics.jammimmo.com

The cleanest path is a **separate Cloudflare Pages project** pointing at the
Umami repo, since you already use CF Pages.

```bash
# 1. Fork or clone umami
git clone https://github.com/umami-software/umami umami
cd umami

# 2. Create a new CF Pages project linked to this repo (via dashboard).
#    Build command:   yarn build
#    Build output:    .next
#    Use the @cloudflare/next-on-pages adapter if needed.

# 3. Set the env vars in CF Pages → Settings → Environment variables:
#    DATABASE_URL = postgresql://umami_user:PASSWORD@db....supabase.co:5432/postgres?schema=umami
#    APP_SECRET   = <long random string>   # for cookie/session signing
#    HASH_SALT    = <long random string>

# 4. Bind analytics.jammimmo.com to this project (Custom Domains).
```

First-load credentials are `admin / umami`. **Change them immediately.**

Inside Umami, create a website for `jammimmo.com` and copy:
- The **Website ID** (UUID)
- The script URL: `https://analytics.jammimmo.com/script.js`

## 3. Set the vitrine env vars

```bash
wrangler pages secret put PUBLIC_UMAMI_SRC --project-name=jammimmo-vitrine
# value: https://analytics.jammimmo.com/script.js

wrangler pages secret put PUBLIC_UMAMI_WEBSITE_ID --project-name=jammimmo-vitrine
# value: the UUID from step 2
```

Trigger a deploy. The Umami beacon now loads on every page and the events
already wired in this codebase start flowing.

## 4. Optional — Microsoft Clarity for heatmaps + session replay

Free, unlimited. Uses one first-party cookie (`_clck`) — the `/cookies` page
discloses it automatically when this var is set.

1. Sign up at https://clarity.microsoft.com → create a project for `jammimmo.com`.
2. Copy the **Project ID**.
3. `wrangler pages secret put PUBLIC_CLARITY_PROJECT_ID --project-name=jammimmo-vitrine`
4. Trigger a deploy.

## 5. Events wired in this codebase

Defined in `src/lib/analytics.ts`:

| Event | Where it fires | Properties |
|---|---|---|
| `lead.form.submitted` | ContactForm success | subject, hasMessage, fromProperty |
| `phone.tapped` | DetailContent, ContactSection, drawer, sticky bar | source |
| `whatsapp.tapped` | DetailContent, drawer, sticky bar | source |
| `directions.tapped` | ContactSection, drawer | source |
| `favorite.added` / `.removed` | FavoriteToggle | ref |
| `compare.added` / `.removed` | CompareToggle | ref |
| `property.viewed` | (TODO: hook into property detail mount) | ref, type, transaction |
| `quartier.viewed` | (TODO: hook into quartier page mount) | slug |
| `search.performed` | (TODO: hook into HeroSearch / ListingsView) | hasQuery, type, transaction, city |

Adding new events: extend the union in `src/lib/analytics.ts`. The static
markup convention is `data-track="event.name" data-track-prop-<key>="value"`.

## Security posture

- **No PII tracked anywhere.** The type signature on `track()` enforces a
  per-event allowlist of properties — names, emails, phones, addresses, free
  text are physically impossible.
- **Umami is first-party** (`analytics.jammimmo.com`) — no third-party origin,
  defeats ad-blockers, tight CSP (no new `script-src` allowlist needed beyond
  this domain).
- **Schema + role isolation** means Umami cannot read property or lead data
  even on a full compromise.
- **No session replay form-field recording.** Clarity is configured to mask
  all inputs (default).
- All trackers respect **Do Not Track** + **Global Privacy Control**.
