import { test, expect, waitForLoaded } from './_helpers';

/**
 * Home `/` — ABOVE-THE-FOLD ONLY.
 *
 * The hero (Hero.astro, `header#top`) is 100% static. We deliberately do NOT
 * full-page snapshot `/` because FeaturedListings below the fold reads
 * listPublicProperties() — empty locally but populated in prod ⇒ flaky.
 *
 * Non-deterministic zones neutralised:
 *  - `#hero-stars`: 60 <i> dots placed with Math.random() at runtime. It is an
 *    `absolute inset-0` full-bleed layer, so we hide it via CSS (display:none in
 *    waitForLoaded -> hideHeroStars) rather than masking it — a Playwright mask
 *    on it would blank the entire above-the-fold view.
 *
 * On iPhone 12 (coarse pointer) the hero parallax JS is skipped by the
 * component, and reducedMotion:'reduce' (config) disables it on desktop too,
 * so the hero geometry is static. animations:'disabled' freezes twinkle /
 * sun-rings / the scroll-cue.
 */
test.describe('home / hero above-the-fold', () => {
  test('loads and matches viewport (hero) snapshot', async ({ page }) => {
    await page.goto('/');

    // (a) LOADING assertion: hero h1 + primary CTA visible, fonts + idle.
    const heroH1 = page.locator('header#top h1');
    await expect(heroH1).toBeVisible();
    await expect(page.locator('header#top a[href="#proprietes"]')).toBeVisible();
    await waitForLoaded(page, 'header#top h1');

    // (b) Visual snapshot — VIEWPORT only (above-the-fold). Stars CSS-hidden.
    await expect(page).toHaveScreenshot('home-hero-fr.png', {
      fullPage: false,
    });
  });

  test('hero region snapshot (scoped to header#top)', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('header#top');
    await expect(hero.locator('h1')).toBeVisible();
    await waitForLoaded(page, 'header#top h1');

    await expect(hero).toHaveScreenshot('home-hero-region-fr.png');
  });
});
