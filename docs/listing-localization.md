# Listing localization preparation

This is a build-time producer, not a translation API for visitors. It prepares
only the public `title`, `commercial_message` and `description` for `en`, `wo`,
`es`, `it` and `ar`. French stays the original. Structured prices, photos,
coordinates, contact information and `updated_at` are not translation inputs.

`scripts/prepare-listing-translations.mjs` imports the shared pure
`src/lib/listing-localization.ts` contract. Node 22.20.0 with
`--experimental-strip-types` is required. The root build integration invokes it
before Astro; this document does not configure Pages, install bindings, apply a
migration, create secrets or authorize an AI call/deployment.

## Two separate activation stages

1. Prepare and deploy the protected server/cache capability **while preserving
   the existing consumers**. Configure the reviewed D1 migration on existing
   `INTAKE_DB`, the AI binding and a new production-only
   `LISTING_TRANSLATION_SECRET`. Verify the intended Jamimmo account, actual
   free-model availability, remaining account quota and protected API behavior.
   A local default budget of 4000 neurons/day is not an account-wide free-quota
   guarantee; unknown attempts remain reserved. There is no paid fallback.
2. After stage 1 is verified, enable production preparation while the old
   consumers remain deployed, and backfill the **current** public, available
   catalogue. Review quality in all five languages, including Wolof,
   then activate the new consumers with that source-bound cache. Do not deploy
   an empty new cache as a silent replacement for the old 34-reference JSON.
   Do not convert/rebind that historical file to current source. This branch
   does not automatically perform the two-stage rollout: root must bind each
   concrete candidate and its actual receipts. Pending/missing translations
   retain French; they are not advertised as translated or complete.

Enable preparation only after stage 1 checks; enable the scheduled retry after
its account budget and protected caller are verified. No source file or unit test establishes that the required bindings,
credentials, account access, quality or free capacity actually exist.

## Production build

Network and cache writes are enabled only when all three hold:

- `CF_PAGES=1`
- `CF_PAGES_BRANCH=main`
- `LISTING_TRANSLATIONS_ENABLED=true`

Local builds, CI smoke builds and preview branches return `disabled` without
reading the catalogue/cache or calling the service. An enabled build needs the
new HMAC secret and existing build-only `ADMIN_SUPABASE_SERVICE_ROLE_KEY`.
`ADMIN_SUPABASE_URL`, if set, must be exactly
`https://ygaawqgwxlbtkcuqecxh.supabase.co`; otherwise that fixed URL is used.
There is no anon-key fallback or arbitrary project/endpoint override.

The producer performs one exact-count query on `properties`, selecting only
`reference,title,commercial_message,description`, filtered by `is_public=true`
and `status=Disponible`. Errors, invalid rows, duplicate references, a missing
count or `count !== data.length` stop the enabled build before Astro. It never
substitutes an empty catalogue for an incomplete read or fetches only a range.
The resource ceiling is 1000 returned listings; exceeding it holds preparation
for an explicit review instead of publishing a partial snapshot. Nullable DB
message/description become empty strings; titles must remain real strings.
Sources above the shared 300/1000/10000 UTF-16 inference bounds are counted as
`skipped`, without truncating them or blocking their French publication. They
do not receive a translation overlay. Invalid field types still refuse the read.

Each missing-language request is a signed POST to the fixed URL
`https://jammimmo.com/api/listing-translations/prepare`. The exact JSON body is:

```json
{"mode":"prepare","property":{"reference":"JI-TEST-FICTIF-001","title":"Public title","commercial_message":"","description":"Public description"},"languages":["en","wo","es","it","ar"]}
```

Header `x-listing-translation-timestamp` is a ten-digit UTC-seconds string;
`x-listing-translation-signature` is lowercase SHA-256 HMAC hex over the UTF-8
bytes of `listing-translations:v1\n${timestamp}\n${rawBody}`. Request bodies are
at most 65536 bytes; responses are streamed with a 1 MiB limit. Redirects fail.
The Node producer has no provider credential and never calls Workers AI itself.
Do not log the raw body, admin token, HMAC secret/signature or arbitrary SDK and
provider errors. CLI output contains only fixed status/codes and numeric counts.

Every returned entry is checked against the exact reference, three source
strings, canonical SHA-256 and five supported locale keys. Empty/nonempty field
parity and the shared text limits apply to translations too. Counts refer to
selected **language rows**, not properties or a proven globally empty backlog.
Only valid previous translations for exactly unchanged source can be retained.
A changed narrative invalidates old translations; a changed photo/price/time
does not. All current source entries are written to
`src/data/listing-localizations.json` using a private `wx` temporary file,
fsync and atomic rename. No user-controlled path is accepted. The local cache
has a 64 MiB resource bound; malformed local cache data holds preparation.

Valid HTTP200 quota/pending results keep valid unchanged cache entries and
French text available, and do not block publication merely because translation
is pending. HTTP, network and response-validation failures stop the build before
any cache write, preserving the previous deployed site even on a fresh checkout.
They cannot publish an empty cache as a successful fallback.
Catalogue/configuration/local-cache errors also remain real build failures. There is
one request per missing current listing in a build, no automatic client resend
after an unknown response. Server cache/leases govern later reconciliation.

The producer and admin credentials are build-only. Do not import the script into
Astro/browser code or rename secrets with `PUBLIC_`/`VITE_` prefixes. Cache JSON
contains only the already-public narratives. Root owns environment filtering in
the build integration; the existing Astro catalogue reader still needs its
build-only admin variables. None belong in generated browser assets or logs.

## Bounded retry

The new workflow runs on the public runner at 04:17 UTC daily, or by manual
dispatch, only on `main` when the repository variable
`LISTING_TRANSLATIONS_ENABLED` is `true`. The `production` environment supplies
the new HMAC secret to the single request step; it supplies no admin/AI/deploy
hook credential. Node built-ins plus the pure contract need no package install.
The selected limit is 1–5 language rows (default 3):

```sh
node --experimental-strip-types scripts/prepare-listing-translations.mjs --retry-pending --limit=3
```

Pending mode additionally requires `GITHUB_ACTIONS=true` and
`GITHUB_REF=refs/heads/main`. It makes no DB or local-cache read/write. The
protected service processes bounded pending rows and uses the **existing**
server-side deploy hook for current ready rows with an outstanding durable refresh.
New ready rows, including publication-time preparation, remain dirty so a lost
prepare acknowledgement can recover without repeating AI. Reviving an old exact
source marks its ready rows dirty again; ordinary current-cache hits do not.
The flag clears only after a successful hook response, fenced to those source
hashes. This can schedule a bounded extra rebuild after a successful preparation;
it does not create a rebuild loop. The client timeout is 500 seconds to cover
up to five sequential 90-second calls and the hook; the workflow is capped at
10 minutes. No client-side
hook secret, Git write, or unbounded retry loop is introduced. Build context
flags are sanity checks, not cryptographic attestation; secret/environment
permissions and rollout decisions remain operator-controlled.

No preview-service override or standalone workstation bootstrap command is
provided. If an authorized manual bootstrap or a preview endpoint is needed,
root must specify and review that exact operation separately; do not fake Pages
or Actions metadata to bypass the disabled local/preview path.

## Verification scope

The Node tests inject all I/O and use fictitious public text. They cover disabled
previews, exact-cache hits, changed source, complete versus truncated DB reads,
honest quota/pending, refused network/protocol failures, historical long source,
forged source hashes, exact HMAC/wire, pending-only mode
and response bounds. They make no AI, hosted DB, R2, Auth or deployment call.
Run them only in the root-owned check lane:

```sh
node --experimental-strip-types --test scripts/prepare-listing-translations.test.mjs
```

Passing these tests would establish the declared local contract only. Live
provider quality/free capacity, current backfill and actual served translations
need their separate bounded operational and visual evidence.
