import { defineConfig, devices } from '@playwright/test';

/**
 * Visual-regression QA — MOBILE-FIRST.
 *
 * Primary device = iPhone 12 (WebKit, 390x844, DSF 3) → project `iphone-12`.
 * A secondary desktop Chromium project is provided for cross-checking but is
 * NOT the priority; mobile is what we gate on.
 *
 * Server: `astro dev` (port 4321). `src/lib/supabase.build.ts` SOFT-FAILS
 * when ADMIN_SUPABASE_* is absent (it only console.warns and returns []/null),
 * so the dev server boots with NO secrets and every data-driven zone renders
 * its deterministic EMPTY state. We deliberately leave PUBLIC_* analytics vars
 * unset so no third-party JS (Clarity / rrweb / analytics POSTs) is injected —
 * that keeps the DOM deterministic for screenshots.
 *
 * Determinism levers (see also each spec):
 *  - `reducedMotion: 'reduce'` forces BaseLayout's reveal branch to add `.in`
 *    immediately (no IntersectionObserver wait, no half-revealed elements) and
 *    disables the hero parallax JS branch.
 *  - `animations: 'disabled'` in toHaveScreenshot freezes CSS animations
 *    (twinkle / sun-rings / slide-cue scroll-cue).
 *  - On iPhone 12 (coarse pointer) the hero parallax is already skipped by the
 *    component itself, so the hero is static there regardless.
 *  - Specs mask the non-deterministic random star field (#hero-stars) and the
 *    Leaflet map container, and abort map-tile network requests.
 *
 * Baselines are PLATFORM-DEPENDENT (macOS WebKit locally vs Linux CI). See
 * tests/visual/README.md for the exact official-container command to (re)generate
 * the Linux baselines that CI must run against.
 */

const PORT = 4321;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/visual',

  // One screenshot baseline per project, kept next to a single shared tree so
  // macOS and Linux variants live side-by-side without clobbering each other.
  // e.g. tests/visual/__screenshots__/proprietaires.spec.ts/iphone-12/proprietaires-fr-darwin.png
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}-{platform}{ext}',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',

  use: {
    baseURL: BASE_URL,
    // Force the reduced-motion branch everywhere: instant .reveal, no parallax.
    reducedMotion: 'reduce',
    colorScheme: 'light',
    // Enregistrement systématique pendant la stabilisation : vidéo + trace
    // time-travel rejouable (`npx playwright show-trace`). À alléger ensuite
    // vers 'retain-on-failure' / 'on-first-retry' (test-results/ grossit vite) —
    // cf. tests/visual/README.md.
    trace: 'on',
    video: 'on',
    screenshot: 'on',
  },

  expect: {
    toHaveScreenshot: {
      // ~2% tolerance absorbs sub-pixel font/AA differences while still
      // catching real layout regressions.
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },

  projects: [
    {
      // PRIORITY — what we gate on. iPhone 12 = WebKit, 390x844, DSF 3.
      name: 'iphone-12',
      use: { ...devices['iPhone 12'] },
    },
    {
      // Secondary cross-check only (not the priority). Desktop Chromium.
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],

  webServer: {
    // `astro dev` boots without secrets and soft-fails Supabase to empty state.
    // 127.0.0.1 (not localhost) avoids IPv6/IPv4 ambiguity on the health check.
    command: 'pnpm dev --port 4321 --host 127.0.0.1',
    // Garde-fou KPI (best-effort) : analytics / Clarity / replay forcés à vide
    // pour le serveur de test. La garantie DURE est le route.abort() de
    // _helpers.ts (clarity.ms + /api/analytics/) — aucune session de test ne
    // doit polluer les vrais KPI.
    env: {
      PUBLIC_ANALYTICS_ENDPOINT: '',
      PUBLIC_CLARITY_PROJECT_ID: '',
      PUBLIC_REPLAY_SAMPLE_RATE: '0',
    },
    // Health-check on /proprietaires: 100% static, no data dependency → a true
    // "page is renderable" signal (vs '/' which mounts data-driven islands).
    url: `${BASE_URL}/proprietaires`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
