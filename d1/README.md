# D1 intake database

Cloudflare D1 (SQLite at the edge) backs the vitrine's write surface —
`leads` and `property_views`. Lives entirely on Cloudflare, separate vendor
from the admin Supabase project. The deployed Worker reaches it via the
`INTAKE_DB` binding in `wrangler.toml`; no API key sits in env.

## Bootstrap (one-time)

```bash
# 1. Create the DB on your CF account
wrangler d1 create jammimmo-intake
#    └─ copy the printed `database_id` into wrangler.toml

# 2. Apply the migration to remote
wrangler d1 execute jammimmo-intake --remote --file=d1/migrations/0001_init.sql

# 3. Apply the migration to local (for `pnpm dev` to work)
wrangler d1 execute jammimmo-intake --local --file=d1/migrations/0001_init.sql
```

For PR previews and the GitHub Actions deploy job, the same binding is read
from `wrangler.toml` — no extra secrets needed.

## Schema

| Table | Purpose |
|---|---|
| `leads` | Contact form submissions from `/api/leads` |
| `property_views` | Cookie-less view tracking from `/api/views` |
| `sync_state` | Cursor table written by the admin-side sync worker |

No FKs to admin tables — D1 is a different vendor entirely. `property_id`
is a plain UUID text column; the admin sync worker joins on it when
mirroring into `admin.intake_leads_mirror`.

## Cross-project sync (admin worker, separate PR)

```text
D1.leads ─────cron 60 s, D1 HTTP API──▶  admin.intake_leads_mirror
                                            (with FK to admin.properties)
```

Auth: a CF account API token scoped to `D1:read` on this DB only. Token
lives in the admin Worker's secrets, never in this vitrine repo.

## Local dev

The Astro dev server runs through wrangler's platform proxy
(`platformProxy: { enabled: true }` in `astro.config.mjs`), so the
`INTAKE_DB` binding works locally too — wrangler stores the local DB at
`.wrangler/state/v3/d1/`. Reset with `rm -rf .wrangler` then re-run the
local migration.

## Free tier limits (more than enough for vitrine intake)

| Limit | Free tier | Vitrine usage at 10k leads/mo |
|---|---|---|
| Storage | 5 GB | < 10 MB |
| Row reads / day | 25M | ~few k (admin sync) |
| Row writes / day | 50k | ~1k |

No upgrade needed before significantly higher traffic.
