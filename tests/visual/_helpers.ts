import { test as base, expect, devices, type Page, type Route } from '@playwright/test';

/**
 * Shared stabilization helpers for the visual-regression suite.
 *
 * The goal of every snapshot is: the page has truly LOADED (its LCP/hero is
 * painted, web fonts are resolved, client islands have hydrated, the network is
 * idle) and every non-deterministic source has been neutralised.
 */
/**
 * Garde-fou KPI : aucune session Clarity ni POST analytics ne doit partir
 * pendant les tests (sinon corruption des vrais KPI). En dev sans `.env` ces
 * vars sont vides → rien n'est émis ; ce `route.abort()` est la garantie DURE
 * (indépendante de l'env) si un `.env` définissait PUBLIC_CLARITY_PROJECT_ID /
 * PUBLIC_ANALYTICS_ENDPOINT, ou si on visait un serveur qui les a : on coupe le
 * script Clarity (clarity.ms) et tous les POST /api/analytics/* (pageview,
 * event, click, replay rrweb). Appliqué à TOUS les specs via le fixture `page`.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/(?:\/\/|\.)clarity\.ms\//i, (r: Route) => r.abort());
    await page.route(/\/api\/analytics\//i, (r: Route) => r.abort());
    await use(page);
  },
});
export { expect, devices };

/**
 * Pin the scroll-reveal animation to its FINAL state, deterministically.
 *
 * Components use `.reveal { opacity:0; transform:translateY(28px) }` which a
 * BaseLayout inline script flips to `.reveal.in { opacity:1; transform:none }`
 * over a 0.9s transition (+ 0.08–0.32s stagger delays). With
 * `reducedMotion:'reduce'` the script adds `.in` immediately so the transitions
 * START at load — but they still TAKE ~1.2s to finish, and `fullPage` capture
 * can land mid-fade (cards at opacity ~0.9, or whole sections still faded out
 * below the fold where the IntersectionObserver path would otherwise apply).
 *
 * We inject a stylesheet AFTER navigation (addStyleTag, verified to win the
 * cascade) that forces `.reveal` to its end state with `!important` and kills
 * the transition. Result: every reveal element is fully painted regardless of
 * scroll position or timing. Called inside `waitForLoaded`, so every spec gets
 * it for free.
 */
export async function freezeReveals(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      .reveal, .reveal.in {
        opacity: 1 !important;
        transform: none !important;
        transition: none !important;
        animation: none !important;
      }
    `,
  });
}

/**
 * Hide the homepage hero star field (`#hero-stars`) by CSS rather than masking.
 *
 * The star container is `absolute inset-0` — it spans the ENTIRE hero, so a
 * Playwright `mask` on it would blank the whole above-the-fold view. Its 60
 * <i> dots are placed with Math.random() at runtime ⇒ non-deterministic. We
 * `display:none` the container so the random dots disappear while the rest of
 * the deterministic hero (gradient, sun, dunes, copy, search card) is captured.
 * Call inside `waitForLoaded` so it is applied before every snapshot.
 */
export async function hideHeroStars(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `#hero-stars { display: none !important; }`,
  });
}

/**
 * Abort Leaflet/OSM map-tile requests so the contact-page map never paints a
 * network-dependent (and therefore flaky) tile grid. Call BEFORE navigation.
 * The map container itself is additionally masked in the snapshot.
 */
export async function blockMapTiles(page: Page): Promise<void> {
  await page.route('**/*', (route: Route) => {
    const url = route.request().url();
    if (
      /tile/i.test(url) ||
      /\b(?:a|b|c)\.tile\./i.test(url) ||
      /tiles?\./i.test(url) ||
      /openstreetmap|jawg|maptiler|basemaps/i.test(url) ||
      /clarity\.ms|\/api\/analytics\//i.test(url)
    ) {
      return route.abort();
    }
    return route.continue();
  });
}

/**
 * Wait until the page is visually settled:
 *  1. the given LCP/hero selector is visible (real "loaded" signal),
 *  2. all @fontsource web fonts have finished loading (avoids FOUT reflow),
 *  3. the network is idle (client:visible / client:idle islands have fetched),
 *  4. all scroll-reveal elements are pinned to their final, fully-painted state.
 */
export async function waitForLoaded(page: Page, lcpSelector: string): Promise<void> {
  await page.locator(lcpSelector).first().waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await freezeReveals(page);
  // No-op CSS on pages without #hero-stars; hides the random star field on home.
  await hideHeroStars(page);
}

/**
 * Best-effort: scroll once to the bottom and back to force any lazy
 * `client:visible` island below the fold to hydrate, then settle at the top.
 * Used for full-page snapshots so deferred islands are in their final state.
 */
export async function settleFullPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 250));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 100));
  });
  await page.waitForLoadState('networkidle');
}
