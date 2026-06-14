# Visual QA — mobile-first regression snapshots

Playwright visual-regression suite for the vitrine. **Mobile is the priority.**

- **Primary device / gating project:** `iphone-12` — Playwright `devices['iPhone 12']`
  (WebKit, 390×844, DSF 3).
- **Secondary cross-check (not gating):** `desktop-chromium` (1280×800).

Each spec does **two** things per page: an explicit **loading assertion** (the LCP/hero
element is visible, web fonts resolved, network idle) and then a `toHaveScreenshot`
comparison against a committed baseline.

## What is covered (deterministic pages only)

| Spec | Page | Snapshot | Notes |
|------|------|----------|-------|
| `proprietaires.spec.ts` | `/proprietaires` (+ `/en`, `/wo`) | full page | 100% static, no DB |
| `home.spec.ts` | `/` hero | viewport + `header#top` region | above-the-fold only (listings below are data-driven) |
| `contact.spec.ts` | `/contact` | full page | Leaflet map tiles aborted + map container masked |
| `static-pages.spec.ts` | `/comparer`, 404 | full page | compare = empty localStorage; 404 via unknown URL |
| `mobile-loading.spec.ts` | `/proprietaires` | viewport (ATF) | asserts iPhone-12 device shape + no horizontal overflow |

We deliberately do **not** full-page snapshot `/`, `/biens`, `/biens/[ref]` or
`/immobilier` — those read live properties (`listPublicProperties`) and are flaky
(empty locally, populated in prod).

## Prerequisites

```bash
pnpm install
pnpm exec playwright install webkit          # primary (iPhone 12)
pnpm exec playwright install chromium         # secondary desktop project
```

The dev server starts itself via Playwright's `webServer` (`pnpm dev` on
`127.0.0.1:4321`). **No secrets / no `.env` are required:** `src/lib/supabase.build.ts`
soft-fails when `ADMIN_SUPABASE_*` is absent, so data-driven zones render their
deterministic empty state. Leaving `PUBLIC_*` (analytics/Clarity) unset keeps the DOM
free of third-party JS — do not add a local `.env` that sets them, or snapshots become
non-deterministic.

## Running

```bash
pnpm run test:visual                          # both projects
pnpm exec playwright test --project=iphone-12 # PRIORITY (gating) project only
pnpm exec playwright test home                # a single spec (substring match)
```

## (Re)generating baselines

```bash
pnpm run test:visual:update                            # all projects
pnpm exec playwright test --project=iphone-12 --update-snapshots   # mobile only
```

Baselines live in `tests/visual/__screenshots__/<spec>/<project>/<name>-<platform>.png`
and **are committed** (the generated `test-results/`, `playwright-report/`,
`blob-report/` are git-ignored). Review regenerated PNGs before committing.

## ⚠️ Baselines are PLATFORM-DEPENDENT — Linux/CI note

Snapshots rendered on **macOS WebKit** (local, `-darwin.png`) will **not** byte-match
the **Linux** rendering used in CI (different font hinting / anti-aliasing). The
`snapshotPathTemplate` includes `{platform}`, so macOS and Linux baselines coexist:

```
…/iphone-12/proprietaires-fr-darwin.png   ← generated locally on macOS
…/iphone-12/proprietaires-fr-linux.png    ← must be generated for CI
```

Generate the **Linux** baselines once, inside the official Playwright container
(matching the installed `@playwright/test` version — currently **1.60.0**), from the
repo root, and commit the resulting `*-linux.png` files:

```bash
docker run --rm --network host -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.60.0-jammy \
  bash -lc "corepack enable && pnpm install --frozen-lockfile \
            && pnpm exec playwright install webkit chromium \
            && pnpm run test:visual:update"
```

Notes:
- `--network host` lets the container reach the Playwright-managed dev server it
  starts on `127.0.0.1:4321`.
- Bump the image tag (`v1.60.0-jammy`) whenever `@playwright/test` is upgraded so the
  browser build matches the runner.
- CI then runs `pnpm run test:visual` (no `--update-snapshots`) against the committed
  `*-linux.png` baselines.

## Determinism levers (where flakiness is neutralised)

- `reducedMotion: 'reduce'` + `animations: 'disabled'` (config) freeze CSS animations
  and force the reduced-motion code paths (instant `.reveal`, hero parallax disabled).
- `_helpers.ts > waitForLoaded()` additionally: waits for the LCP selector, awaits
  `document.fonts.ready`, waits for `networkidle`, **freezes all `.reveal` elements to
  their final painted state** (`freezeReveals`, the staggered 0.9s reveal transition
  otherwise lands mid-fade in full-page captures), and **hides the random hero star
  field** `#hero-stars` via CSS (`hideHeroStars`).
- `_helpers.ts > blockMapTiles()` aborts Leaflet/OSM tile requests on `/contact`; the
  map container is also masked.
- `maxDiffPixelRatio: 0.02` (config) tolerates sub-pixel AA noise.
