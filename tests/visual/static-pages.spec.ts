import { test, expect, waitForLoaded, settleFullPage } from './_helpers';

/**
 * Other fully-deterministic static pages: /comparer (empty localStorage state)
 * and the 404 page (served via an unknown URL).
 */

test.describe('/comparer (FR)', () => {
  test('loads (empty compare state) and matches full-page snapshot', async ({ page }) => {
    // Fresh Playwright context ⇒ empty localStorage ⇒ CompareTable empty state.
    await page.goto('/comparer');

    const h1 = page.locator('main h1');
    await expect(h1).toBeVisible();
    await waitForLoaded(page, 'main h1');
    await settleFullPage(page);

    await expect(page).toHaveScreenshot('comparer-fr.png', {
      fullPage: true,
    });
  });
});

test.describe('404 page', () => {
  test('unknown URL serves 404 and matches full-page snapshot', async ({ page }) => {
    const res = await page.goto('/zzz-this-page-does-not-exist');
    // Loading assertion also covers correctness: real 404 status + heading.
    expect(res?.status()).toBe(404);

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(page.locator('main a[href="/"]')).toBeVisible();
    await waitForLoaded(page, 'main h1');
    await settleFullPage(page);

    await expect(page).toHaveScreenshot('404-fr.png', {
      fullPage: true,
    });
  });
});
