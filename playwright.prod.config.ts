import { defineConfig, devices } from '@playwright/test';

/**
 * E2E COMPORTEMENTAL EN PROD (https://jammimmo.com) — pas de snapshots visuels ici
 * (le visuel vit dans playwright.config.ts contre le dev local). On vérifie que la
 * FEATURE marche réellement en prod et on ENREGISTRE la vidéo + la trace du parcours.
 *
 * Garde-fou KPI : les specs importent le `test` étendu de tests/visual/_helpers, qui
 * fait route.abort() sur clarity.ms + /api/analytics/* — donc l'e2e ne crée AUCUNE
 * session Clarity ni événement analytics : les vrais KPI ne sont pas pollués.
 *
 * Lancer : pnpm exec playwright test --config=playwright.prod.config.ts
 * (override possible : PROD_BASE_URL=https://<preview>.pages.dev)
 */
const BASE = process.env.PROD_BASE_URL || 'https://jammimmo.com';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: BASE,
    trace: 'on',       // trace time-travel rejouable (npx playwright show-trace)
    video: 'on',       // vidéo de chaque test (record du parcours de la feature)
    screenshot: 'on',
  },
  projects: [
    { name: 'iphone-12', use: { ...devices['iPhone 12'] } }, // prioritaire (mobile-first)
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
