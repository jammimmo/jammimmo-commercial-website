# Tier 3 isolation — Cloudflare provisioning handoff

**Branch:** `feat/tier-3-isolation` • **PR:** #3 • **Date written:** 2026-05-27

Previous Claude Code session built out all the code for Tier 3 isolation (split
build vs runtime DB credentials, D1-backed intake, KV-debounced revalidate
webhook, edge-function cleanup job) but couldn't finish provisioning because
its container's network policy blocked `api.cloudflare.com`. Everything below
is the residual provisioning work + the first deploy.

This document is the kickoff for a fresh session in an environment that allows
`api.cloudflare.com` outbound.

---

## 0. Prereqs check

- [ ] `wrangler whoami` returns the Jammimmo account, not a 403. If it 403s with
  `Host not in allowlist`, the new environment ALSO blocks Cloudflare — stop
  and ask the user to recreate it with a broader network policy. See
  <https://code.claude.com/docs/en/claude-code-on-the-web>.
- [ ] You're on branch `feat/tier-3-isolation`. If not: `git checkout feat/tier-3-isolation && git pull`.
- [ ] The user has handed you a **fresh** Cloudflare API token (the previous one
  was exposed in transcript and should be rotated).

Required token scopes (token template "Edit Cloudflare Workers" + add):
`Account.D1:Edit`, `Account.Workers KV Storage:Edit`,
`Account.Cloudflare Pages:Edit`, `Zone.DNS:Edit` (for `jammimmo.com` zone).

Export for the session:

```bash
export CLOUDFLARE_API_TOKEN="<fresh-token>"
export CLOUDFLARE_ACCOUNT_ID="3f69ecd39bdecb674be8c3a20bc6d756"
```

---

## 1. Provision Cloudflare resources

Run these in order. Capture the IDs printed by steps 1 and 2 — you'll paste
them into `wrangler.toml`.

```bash
# 1. D1 database — capture `database_id`
pnpm wrangler d1 create jammimmo-intake

# 2. KV namespace — capture `id`
pnpm wrangler kv namespace create REFRESH_KV

# 3. Pages project (must exist BEFORE first `pages deploy`)
pnpm wrangler pages project create jammimmo-vitrine \
  --production-branch=main \
  --compatibility-date=2026-05-01

# 4. Apply D1 schema to the remote DB
pnpm wrangler d1 execute jammimmo-intake --remote \
  --file=d1/migrations/0001_init.sql

# 5. Attach custom domains (DNS records get created in the jammimmo.com zone)
pnpm wrangler pages domain add jammimmo.com     --project-name=jammimmo-vitrine
pnpm wrangler pages domain add www.jammimmo.com --project-name=jammimmo-vitrine
```

---

## 2. Patch `wrangler.toml`

Replace the two `REPLACE_WITH_*` placeholders with the IDs from steps 1 and 2
above:

```toml
[[kv_namespaces]]
binding = "REFRESH_KV"
id = "<KV id from step 2>"

[[d1_databases]]
binding   = "INTAKE_DB"
database_name = "jammimmo-intake"
database_id   = "<D1 database_id from step 1>"
```

Commit:

```bash
git add wrangler.toml
git -c commit.gpgsign=false commit -m "chore: wire D1 + KV ids into wrangler.toml"
```

---

## 3. Set GitHub Actions secrets

Four secrets are needed by `.github/workflows/{deploy,check}.yml`. None are set
yet (verified via API). Use the GH API directly — `gh` CLI is not installed:

```bash
REPO="jammimmo/jammimmo-commercial-website"
GH_TOKEN=$(git config --get remote.origin.url | sed -E 's|.*oauth2:([^@]+)@.*|\1|')

set_secret() {
  local name="$1" value="$2"
  # Fetch the repo public key
  read -r KEY_ID KEY < <(curl -sS -H "Authorization: Bearer $GH_TOKEN" \
    "https://api.github.com/repos/$REPO/actions/secrets/public-key" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["key_id"],d["key"])')
  # Encrypt with libsodium
  ENC=$(python3 - "$KEY" "$value" <<'PY'
import sys, base64
from nacl import public, encoding
pub = public.PublicKey(sys.argv[1].encode(), encoding.Base64Encoder())
box = public.SealedBox(pub)
print(base64.b64encode(box.encrypt(sys.argv[2].encode())).decode())
PY
)
  curl -sS -X PUT -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/actions/secrets/$name" \
    -d "{\"encrypted_value\":\"$ENC\",\"key_id\":\"$KEY_ID\"}"
  echo "set: $name"
}

# `pip install pynacl` if the import fails
set_secret CLOUDFLARE_API_TOKEN              "$CLOUDFLARE_API_TOKEN"
set_secret CLOUDFLARE_ACCOUNT_ID             "$CLOUDFLARE_ACCOUNT_ID"
set_secret ADMIN_SUPABASE_URL                "<ask user>"
set_secret ADMIN_SUPABASE_SERVICE_ROLE_KEY   "<ask user>"
```

`ADMIN_SUPABASE_*` are the admin (CMS) Supabase project's URL and service-role
key — separate from any vitrine-side keys. The build job at
`.github/workflows/deploy.yml:38` reads them via `src/lib/supabase.build.ts`.

**Verify:**

```bash
curl -sS -H "Authorization: Bearer $GH_TOKEN" \
  https://api.github.com/repos/$REPO/actions/secrets | python3 -m json.tool
# Should show 4 secrets.
```

---

## 4. Set Cloudflare Pages runtime secrets

The Pages edge functions read three runtime secrets that must NOT live in the
repo (`functions/api/leads.ts`, `functions/api/views.ts`,
`functions/api/revalidate.ts`, `functions/api/cleanup.ts`):

```bash
# HMAC signing key for the /api/revalidate webhook from admin Supabase
pnpm wrangler pages secret put REVALIDATE_HMAC_SECRET --project-name=jammimmo-vitrine
# paste a freshly generated 32-byte hex: openssl rand -hex 32

# GitHub token w/ `repo` scope — lets /api/revalidate fire repository_dispatch
pnpm wrangler pages secret put GH_DISPATCH_TOKEN --project-name=jammimmo-vitrine
# user must mint this in their GH account; classic PAT or fine-grained with Actions:write

# Repo target for dispatch
pnpm wrangler pages secret put GH_REPO --project-name=jammimmo-vitrine
# value: jammimmo/jammimmo-commercial-website
```

Also configure the admin Supabase project to call
`https://jammimmo.com/api/revalidate` on property updates, signing the body
with the same `REVALIDATE_HMAC_SECRET`. (That's an admin-side change — flag it
to the user; don't try to do it from here.)

---

## 5. Merge PR #3 and trigger first deploy

```bash
# Merge the PR via API (squash). Confirm with the user FIRST.
curl -sS -X PUT -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$REPO/pulls/3/merge \
  -d '{"merge_method":"squash"}'
```

The push to `main` triggers `.github/workflows/deploy.yml`, which builds the
Astro site and runs `cloudflare/wrangler-action@v3` with
`pages deploy dist --project-name=jammimmo-vitrine --branch=main`.

**Watch the run:**

```bash
curl -sS -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/$REPO/actions/runs?branch=main&per_page=1" \
  | python3 -c 'import sys,json;r=json.load(sys.stdin)["workflow_runs"][0];print(r["status"],r["conclusion"],r["html_url"])'
```

---

## 6. Post-deploy validation

```bash
# Vitrine renders
curl -sSI https://jammimmo.com/ | head -5
curl -sSI https://www.jammimmo.com/ | head -5  # should 200 or redirect to apex

# /api/leads accepts POST (will 400 on empty body — that proves the route is live)
curl -sS -X POST https://jammimmo.com/api/leads -H "Content-Type: application/json" -d '{}'

# /api/revalidate rejects unsigned POSTs (proves HMAC gate is wired)
curl -sS -X POST https://jammimmo.com/api/revalidate -d '{}' -w "\nHTTP %{http_code}\n"
# expect HTTP 401

# D1 has rows after a real submission
pnpm wrangler d1 execute jammimmo-intake --remote \
  --command="SELECT COUNT(*) FROM leads;"
```

If `/api/leads` returns 500, check the function logs:

```bash
pnpm wrangler pages deployment tail --project-name=jammimmo-vitrine
```

---

## 7. Cleanup

Once the deploy is green and validation passes:

- [ ] Confirm the user has rotated the original CF token leaked in the prior
  session's transcript.
- [ ] Remove this HANDOFF.md (`git rm HANDOFF.md && git commit -m "chore: remove handoff doc"`) — it's a one-shot.
- [ ] Tell the user what's still on their plate (admin Supabase webhook
  configuration if step 4 mentioned it).
