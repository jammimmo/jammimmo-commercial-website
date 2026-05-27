# Intake Supabase project

Separate Supabase project from the admin SaaS DB (`jammimmo-estate-flow`).
Holds the vitrine's **write surface only**: leads + property_views. Created
as part of Tier 3 isolation — the deployed vitrine has zero credentials to
the admin DB, and the worst a vitrine compromise can do is spam this intake
DB. Admin staff see leads via an admin-side worker that pulls rows from
here every ~60 s and joins them with admin data in the admin DB.

## Bootstrap (one-time)

```bash
# 1. Create project at supabase.com:
#    - Name: jammimmo-intake
#    - Region: eu-west-3 (same as admin, minimizes sync latency)
#    - Free tier is enough; upgrade only if intake volume exceeds 500 MB.
#
# 2. Link the Supabase CLI to the new project:
supabase link --project-ref <intake-project-ref>
#
# 3. Apply migrations:
supabase db push --include-all
#
# 4. Capture credentials for the vitrine GH Actions / Pages secrets:
supabase projects api-keys --project-ref <intake-project-ref>
#    Copy:
#      anon key     -> INTAKE_SUPABASE_ANON_KEY (CF Pages secret)
#      service_role -> ADMIN_INTAKE_SYNC_KEY    (admin-side worker secret)
```

## Schema

| Table | Anon | service_role | Purpose |
|---|---|---|---|
| `leads` | INSERT only | full | Contact form submissions from `/api/leads` |
| `property_views` | INSERT only | full | Cookie-less view tracking from `/api/views` |

No FKs to admin tables (cross-project FKs are not possible). `property_id`
is a plain UUID — the admin-side worker resolves it against
`admin.properties.id` when mirroring.

## Cross-project sync (admin worker, separate PR)

```text
intake.leads          ──┐
                        │  60-s cron, service_role
                        ▼
                admin.intake_leads_mirror  (with FK to admin.properties)
```

Sync uses `created_at > last_synced_at` and dedupes by intake `id`. Lag is
~60–90 s from form submit to visible-in-admin. Out of scope for this PR.

## Key rotation

If the runtime `INTAKE_SUPABASE_ANON_KEY` ever leaks:

1. Supabase dashboard → API Settings → rotate anon key.
2. Update `INTAKE_SUPABASE_ANON_KEY` in Cloudflare Pages secrets.
3. Trigger a redeploy (`gh workflow run deploy.yml` or push to main).
4. Worst case during rotation: ~2 min of lead form submits return 500. The
   form retries client-side on next user attempt.

No data exposure during rotation — the leaked key only grants INSERT, no
SELECT, on a DB that holds no admin data.
