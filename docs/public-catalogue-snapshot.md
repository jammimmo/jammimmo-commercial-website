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

## Explicit build mode

Use the normal reviewed release process with these build environment values:

```sh
CATALOGUE_BUILD_SOURCE=public-snapshot-20261031
CATALOGUE_SNAPSHOT_SHA256=60f64ea76325fd5f5098e6938e768c983963a6ec892b11f9584c73f2fef8c8cb
```

All four `supabase.build.ts` readers use the validated snapshot before any
client creation, credential handling or database query. An unknown mode,
missing/wrong hash, invalid capture, missing row or unprojected field aborts
the build; there is no DB or empty-catalogue fallback in this mode. When the
mode is absent the previous reader behavior is retained. **A build without
the approved mode is not proof that this release preserved the catalogue.**
No dashboard variable, build command, credentials or cloud resource has been
changed by this source work.

Filtering and limits preserve the four existing signatures. The existing
query's publication-date order remains primary, optional price order remains
secondary; tied rows keep capture order. Similar listings use the captured
order after the same city/type/id filters. A future catalogue refresh must
have a separately reviewed capture, projection and hashes; the date never
advances merely because another build runs.

## Chat facts and source controls

The Worker imports only the separate facts corpus: no media, address, geographic
zone, document, availability status or admin metadata. Facts are deterministic;
the LLM neither receives nor supplies their values. Exact full references,
unique short references and validated page context resolve a listing. Ambiguous,
unknown or conflicting references ask for clarification. Explicit new searches
and guide/tool questions do not inherit the currently viewed property's facts.

Every answer names the capture date and requires confirmation of present
availability/conditions. Zero price/surface/bedroom values are unknown, never
free, a zero-area property or an inferred studio. A rental period is retained
only if exactly one positive public `pricing.month/night/week` value equals
the displayed price. Otherwise the period is explicitly unspecified; private
owner tariffs are never consulted. Negative/missing amenity flags are not
promoted into claims of presence.

Source IDs are `property:<public-id>:<capture-revision>`. As with the editorial
corpus, an empty `sourceIds` setting means all curated sources; a nonempty list
must explicitly include a property source to enable it. Persisted citations
append the field name and are reconstructed from the same revision, exact
scalar excerpt and canonical URL. A forged URL/title/value or another revision
cannot become evidence. Short scalar excerpts are valid citations even when
shorter than the editorial 20-character minimum.

## Prepared local validation

Run only in the task's serialized test slot:

```sh
python3 scripts/test_public_catalogue.py
pnpm exec vitest run src/lib/public-catalogue.test.ts src/lib/chat/property-facts.test.ts src/lib/chat/backend.test.ts src/lib/chat/retrieval.test.ts --maxWorkers=1 --minWorkers=1
```

Use Node 22.20 for the actual SQLite backend tests. These cover hostile tuples,
duplicate/prototype keys, missing rows, private metadata, references, four
readers with network forbidden, hashes, source settings, citations, search/guide
priority and visitor-response handoff notifications. They do not establish
production routing or visual acceptance. The final approved snapshot build must
still check generated detail routes, JSON endpoints and sitemap against all 97
references, including the three historical references, before release.
