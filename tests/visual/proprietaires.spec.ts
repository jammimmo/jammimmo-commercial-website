import { test, expect, waitForLoaded, settleFullPage } from './_helpers';

/**
 * /proprietaires — P0 deterministic target.
 *
 * 100% static marketing content (OwnerContent.astro), ZERO DB reads. The hero
 * <h1> (a level-1 heading) is the LCP/loading anchor. Snapshot is FULL PAGE.
 */
test.describe('/proprietaires (FR)', () => {
  test('loads and matches full-page snapshot', async ({ page }) => {
    await page.goto('/proprietaires');

    // (a) LOADING assertion: the hero h1 must be visible + fonts + idle.
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await waitForLoaded(page, 'header h1');
    await settleFullPage(page);

    // (b) Visual snapshot — full page (page is short and fully deterministic).
    await expect(page).toHaveScreenshot('proprietaires-fr.png', {
      fullPage: true,
    });
  });

  // i18n variants (P2) — same static body, localized copy.
  for (const { lang, path } of [
    { lang: 'en', path: '/en/proprietaires' },
    { lang: 'wo', path: '/wo/proprietaires' },
  ]) {
    test(`${lang} variant loads and matches full-page snapshot`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await waitForLoaded(page, 'header h1');
      await settleFullPage(page);
      await expect(page).toHaveScreenshot(`proprietaires-${lang}.png`, {
        fullPage: true,
      });
    });
  }
});
