import { test, expect, devices, waitForLoaded } from './_helpers';

/**
 * MOBILE LOADING — explicit iPhone 12 render correctness.
 *
 * This is NOT primarily a pixel snapshot; it asserts that the page actually
 * RENDERS correctly on iPhone 12 (390x844, DSF 3, WebKit): the viewport is the
 * expected mobile size, the device-scale factor is 3, the hero LCP element is
 * visible above the fold, and no horizontal overflow occurs (a classic mobile
 * layout bug). It then takes a viewport screenshot as a bonus regression guard.
 *
 * It runs on BOTH projects but the meaningful assertions are guarded so the
 * device-shape checks only fire on the mobile project.
 */
const IPHONE_12 = devices['iPhone 12'];

test.describe('mobile loading (iPhone 12)', () => {
  test('/proprietaires renders correctly on mobile', async ({ page }, testInfo) => {
    await page.goto('/proprietaires');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await waitForLoaded(page, 'header h1');

    const isMobileProject = testInfo.project.name === 'iphone-12';

    // Device-shape correctness — only meaningful on the iPhone 12 project.
    if (isMobileProject) {
      const viewport = page.viewportSize();
      expect(viewport).toEqual(IPHONE_12.viewport); // 390x844
      const dpr = await page.evaluate(() => window.devicePixelRatio);
      expect(dpr).toBe(IPHONE_12.deviceScaleFactor); // 3

      // Hero LCP must sit within the first viewport (above the fold).
      const box = await h1.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeLessThan(IPHONE_12.viewport.height);
    }

    // No horizontal overflow — guards against mobile layout breakage.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1); // sub-pixel tolerance

    // Bonus regression guard: above-the-fold viewport snapshot.
    await expect(page).toHaveScreenshot('mobile-proprietaires-atf.png', {
      fullPage: false,
    });
  });
});
