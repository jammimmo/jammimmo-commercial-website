import { test, expect, waitForLoaded, settleFullPage } from './_helpers';

/**
 * /partenaires — P0 deterministic target.
 *
 * 100% static marketing content (PartnerContent.astro), ZERO DB reads. The hero
 * <h1> (a level-1 heading) is the LCP/loading anchor. Snapshot is FULL PAGE.
 */
test.describe('/partenaires (FR)', () => {
  test('loads and matches full-page snapshot', async ({ page }) => {
    await page.goto('/partenaires');

    // (a) LOADING assertion: the hero h1 must be visible + fonts + idle.
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await waitForLoaded(page, 'header h1');
    await settleFullPage(page);

    // (b) Visual snapshot — full page (page is short and fully deterministic).
    await expect(page).toHaveScreenshot('partenaires-fr.png', {
      fullPage: true,
    });
  });

  // i18n variants (P2) — same static body, localized copy.
  for (const { lang, path } of [
    { lang: 'en', path: '/en/partenaires' },
    { lang: 'wo', path: '/wo/partenaires' },
  ]) {
    test(`${lang} variant loads and matches full-page snapshot`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await waitForLoaded(page, 'header h1');
      await settleFullPage(page);
      await expect(page).toHaveScreenshot(`partenaires-${lang}.png`, {
        fullPage: true,
      });
    });
  }
});
