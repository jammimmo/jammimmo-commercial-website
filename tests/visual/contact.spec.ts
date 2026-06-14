import { test, expect, waitForLoaded, settleFullPage, blockMapTiles } from './_helpers';

/**
 * /contact — P0 deterministic target.
 *
 * Copy + form (ContactForm) + agency map (PropertyMap) are static islands; the
 * only non-deterministic zone is the Leaflet map (network tiles). We abort tile
 * requests AND mask the map wrapper so the snapshot is stable.
 *
 * LCP/loading anchor = the section heading `section#contact h2`.
 */
test.describe('/contact (FR)', () => {
  test('loads and matches full-page snapshot (map masked)', async ({ page }) => {
    await blockMapTiles(page);
    await page.goto('/contact');

    // (a) LOADING assertion: section title + a contact info link visible.
    const title = page.locator('section#contact h2');
    await expect(title).toBeVisible();
    await expect(
      page.locator('a[data-track="phone.tapped"][data-track-prop-source="contact"]'),
    ).toBeVisible();
    await waitForLoaded(page, 'section#contact h2');
    await settleFullPage(page);

    // (b) Visual snapshot — full page, Leaflet map container masked.
    await expect(page).toHaveScreenshot('contact-fr.png', {
      fullPage: true,
      mask: [
        page.locator('.leaflet-container'),
        // Fallback wrapper mask in case Leaflet hasn't created its container.
        page.locator('section#contact .h-\\[220px\\]'),
      ],
    });
  });
});
