# Approved public catalogue capture, 31 October 2026

This release can preserve the 97 listings already published at
`https://jammimmo.com/biens/` while the administrative database is unavailable.
It does not establish database health, live availability, or an independent
HTTP 200 for every historical detail URL.

The parent task captured the public HTML once at **2026-10-31T09:29:04Z**.
The immutable input is 470819 bytes, SHA256
`700e106adaf9d1cbcd466c551bda83d4873cfd045809678bf9c4579e74ce6f38`.
The raw HTML stays in the private task artifacts because legacy serialized
attributes contain internal metadata that this projection removes.

## Reproduce the projection locally

```sh
python3 scripts/extract-public-catalogue.py --input /absolute/path/public-catalogue-current.html
```

The standard-library HTML parser reads exactly one ListingsView island. Strict
JSON rejects duplicate and dangerous keys. The bounded decoder implements only
tags 0 (value/object) and 1 (array), matching the installed Astro **4.16.19**
`dist/runtime/server/serialize.js` and `astro-island.js`. It never evaluates
HTML or JavaScript. It requires the approved input hash, 97 unique case-folded
references, and the same 97 URLs in the CollectionPage JSON-LD. The existing
listings limit is 200, so this capture did not reach that limit.

Outputs and normalization details are recorded in
`src/data/public-catalogue-20261031.manifest.json`:

- `public-catalogue-20261031.json`: 242317 bytes, SHA256
  `60f64ea76325fd5f5098e6938e768c983963a6ec892b11f9584c73f2fef8c8cb`.
- `public-property-facts-20261031.json`: 107561 bytes, SHA256
  `880983b46ceafa034130abab5183eba239d3cab65c4f704a8bfbb2a025ae0ea2`.

The public build projection retains all 97 rows and the 13 attribute keys
actually consumed by the current renderer. Owner prices, commissions, tour
jobs/review metadata, original-description bags and other unused attributes
are absent. Documents become `{}`: the capture contains 88 arrays of legacy
status objects and 9 dictionaries of non-URL statuses, not downloadable files.
The 40 existing approximate 500m zones are retained without adding exact GPS;
57 absent zones stay absent. Media URLs are validated but never fetched here.

The three historical references with underscores or emoji are retained, not
renamed. Each canonical URL encodes one path segment and is checked against
the captured href. Their actual HTTP responses remain unverified. The build
reader supports the existing lowercase-slug/uppercase-lookup round trip.

## Build contexts and freshness

`pnpm build` runs `scripts/build-approved-catalogue.mjs` with Node **22.20+**.
Local builds and CI use the immutable approved97 capture. The build entry
refuses hosted previews on the production Pages project.
They never initialize a database client or read source credential values.
An explicitly supplied snapshot source/hash must match the values above.

A Pages production build must instead prepare a fresh public artifact. The
wrapper requires `CF_PAGES=1`, branch `main`, a 40-character commit SHA and a
HTTPS deployment URL under `jammimmo-vitrine.pages.dev`, together with
`CATALOGUE_BUILD_SOURCE=trusted-production`. Missing/ambiguous context, another
project, a child-only artifact override, or the former production snapshot
source/hash fail before credentials or source I/O. These metadata checks detect
mistakes; they do not protect secrets from hostile parent/checkout/install code.

Preparation uses only the existing public `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_ANON_KEY` configuration for project `ygaawqgwxlbtkcuqecxh`.
The ordinary command receives them from Pages. The dedicated production entry
below supplies the same pair from the reviewed build profile. A legacy JWT
must identify this project and role `anon`; a publishable key remains subject
to server RLS. Secret/service-role substitutions are refused before I/O.
`ADMIN_SUPABASE_*` are never read. Both public settings are also blanked in the
Astro child because the renderer needs only the prepared public data.

The selected columns follow the existing anon allowlist in Estate Flow migration
`20261023164421_anonymous_catalogue_containment.sql`. There is no new grant, RPC
or RLS change. Address, the attributes bag (including JSON paths), documents,
owner prices and exact GPS are not queried. Fresh address is null, documents are
empty and rental period is unknown. Exact positive public commodity labels
Climatisation/Ascenseur/Piscine/Jardin/Terrasse become corresponding true facts;
absence never means false, tags are not evidence, and Parking public does not
become a private parking claim.

The 13 already-public attributes from the approved97 capture may be reused only
when a fresh eligible row has the same UUID, reference, **full timestamp string**
and every comparable public field, including arrays and price. There is no
Date.parse/millisecond shortcut. Missing rows are never recreated; any field or
timestamp difference discards these extras. Changed/new listings retain only
fresh positive commodity evidence. The chatbot marks reused extras with their
original capture date and explicitly says they were not reread from the database.
This deliberately does not reconstruct an old address or rental period. The
source trigger that maintains updated_at is not proof of its remote state;
verify that prerequisite after recovery, without probing during the incident.

Preparation reads only the existing published-property source and the existing
public approximate-geography view. There are at most two GETs, no automatic
retry or redirect, a shared 15-second deadline, 8 MiB per response and 1000 rows
per source. The properties predicate includes `is_public=true`,
`status=Disponible` and `deleted_at is null`. Exact counts, complete ranges,
unique identifiers and validated public values are required. Geographic rows
are joined only to freshly eligible UUIDs; an older view cannot resurrect a
soft-deleted listing. Every incoming geographic row must meet the view contract. A successful exact `*/0` response is a genuinely empty public source
(e.g. withdrawal of the final listing); missing counts, `*` totals, HTTP errors,
invalid JSON or truncated rows never become an empty catalogue.

Fresh geographic centres are independently coarsened with the exact existing
Estate Flow `approximatePropertyCenter` algorithm (`src/lib/property-tour-map.ts`,
source3df7904): stable ~1km grid, no random jitter, no exact GPS/address input.
Coordinates outside that contract are rejected. A prepared zone has radius1500m
so the expanded circle covers both the former500m zone and grid displacement.
Validation rejects a prepared off-grid centre or finer radius. The historical97
snapshot remains unchanged; none of its already-public500m zones establishes
remote view health. Verify the authorized public view after database recovery.
The facts corpus contains no geography or address.

The validated output consists of catalogue, facts and approval JSON in a new
immutable `.catalogue-build/<approval-sha256>/` directory. No secret or raw
response is stored. Config-time hash checks and a pairwise comparison bind
both files to one revision. Astro aliases select this same revision for the
four existing readers and the facts Worker. The renderer has no database
client or credential fallback. The child environment blanks all three
`ADMIN_SUPABASE_*` values. The 200-row listing cap is removed; the source-wide
1000-row bound is explicit and cannot silently truncate the main search page.
Existing estimation/matching/quartier consumers retain their intentional200-row
limits and home featured retains6; the201-row oracle does not prove exhaustive
coverage of those bounded subsets.

A failed preparation never starts Astro, never replaces the approved97 files
and never promotes an empty/stale fallback build. The previous Pages deployment
remains serving until a complete build is promoted by Pages. The HMAC-protected
`/api/revalidate` endpoint still calls the existing production deploy hook;
that build must run this wrapper. It does not itself change a JSON artifact.
During the database incident a new production build may therefore fail safely;
the already deployed catalogue remains available, and publication updates are
pending rather than falsely reported by this build as refreshed.

Before release, verify the real Pages production branch, build command and
public source scope. The ordinary `pnpm build` keeps the environment contract
above. If Pages stores the retired production snapshot settings as encrypted
rows, select the reviewed command `pnpm install --frozen-lockfile && pnpm run
build:pages-live` in the existing Pages project build configuration. Keep Node
22.20 and the `dist` output directory.

`build:pages-live` runs only on the verified Pages production context. Its
tracked build-only profile contains the existing anon key for the same project.
The entry accepts either no source settings, `trusted-production` without a
snapshot hash, or the exact retired snapshot source and hash together. It
passes fresh-production inputs to the same preparation wrapper in all three
cases. Other hashes, partial settings, conflicting public source values and
prepared-artifact overrides stop before source preparation. The renderer
receives the prepared artifact and no database credentials. No Wrangler
runtime binding is added for these build inputs.

The dedicated command accepts only the production branch. Keep the native
Preview branch setting at **None** and remove Preview credentials before
checkout or dependency installation. The production build command must be
selected before the exact release is triggered.

Run `node scripts/check-pages-preview-isolation.mjs` with an account-scoped
`CLOUDFLARE_PAGES_READ_TOKEN` from a trusted shell. The **Audit hosted Pages
isolation** GitHub workflow on `main` runs the same check and requires that
repository secret. Missing credentials, incomplete provider metadata, active
automatic previews, shared D1 or KV, and Supabase or other unapproved credentials
fail the check. To check the provider settings of a separate static staging
project, pass `--staging-project NAME`. That check requires no remote bindings
or database credentials in either of its environments. A staging project that
needs D1, KV or Supabase requires an approved resource inventory first.

The workflow reports the current configuration. It neither deploys nor controls
a deployment by itself. The read token belongs only to this audit. A separate
static staging build can use the approved public capture from local CI without a
Cloudflare or Supabase credential. Its hosting and upload pipeline require
separate configuration. The repository's hosted build remains scoped to the
production Pages project.

The Wrangler Preview config clears D1, KV and R2 and omits the non-inherited
AI binding. The CLI reads the provider's current settings separately. Source
configuration and a local validation do not attest existing deployments. See
the [Cloudflare Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
and [branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/).

Filtering and limits preserve the four existing signatures. Publication date
remains the primary list order; price remains secondary when requested. All
properties, detail paths, static JSON, sitemap entries and chatbot facts are
built from one revision. Individual property URLs and real publication latency
still need their own release acceptance; two source reads do not assert an
atomic database snapshot or live availability at visitor request time.

## Chat facts and source controls

The Worker imports only the separate facts corpus: no media, address, geographic
zone, document, availability status or admin metadata. Facts are deterministic;
the LLM neither receives nor supplies their values. Exact full references,
unique short references and validated page context resolve a listing. Ambiguous,
unknown or conflicting references ask for clarification. Explicit new searches
and guide/tool questions do not inherit the currently viewed property's facts.

Every answer names the actual capture/preparation date and time and requires confirmation of present
availability/conditions. Zero price/surface/bedroom values are unknown, never
free, a zero-area property or an inferred studio. In the historical capture only, a rental period is retained
only if exactly one positive public `pricing.month/night/week` value equals
the displayed price. Otherwise the period is explicitly unspecified; private
owner tariffs are never consulted. Fresh anon preparation leaves the period unknown. Negative/missing amenity flags are not
promoted into claims of presence.

Source IDs are `property:<public-id>:<capture-revision>`. As with the editorial
corpus, an empty `sourceIds` setting means all curated sources; a nonempty list
must explicitly include a property source to enable it. Persisted citations
append the field name and are reconstructed from the same revision, exact
scalar excerpt and canonical URL. A forged URL/title/value or another revision
cannot become evidence. Short scalar excerpts are valid citations even when
shorter than the editorial 20-character minimum.

## Prepared local validation

Run only in the task's serialized test slot (all source tests use closed I/O fixtures):

```sh
node --test --test-concurrency=1 scripts/build-approved-catalogue.test.mjs scripts/catalogue-artifact.test.mjs
python3 scripts/test_public_catalogue.py
pnpm exec vitest run src/lib/catalogue-freshness.test.ts src/lib/supabase.build.security.test.ts src/lib/public-catalogue.test.ts src/lib/chat/property-facts.test.ts src/lib/chat/backend.test.ts src/lib/chat/retrieval.test.ts --maxWorkers=1 --minWorkers=1
```

Use Node 22.20 for the actual SQLite backend tests. These cover hostile tuples,
duplicate/prototype keys, missing rows, private metadata, references, four
readers with network forbidden, hashes, source settings, citations, search/guide
priority and visitor-response handoff notifications. They do not establish
production routing or visual acceptance. The final builds must still check generated detail routes, JSON endpoints and
sitemap against the selected revision: approved97, then a closed fixture with
a new98th listing, a removal and a repricing. Include the historical references.
These checks have not been run merely by preparing the source.
