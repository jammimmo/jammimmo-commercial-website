import { test, expect, waitForLoaded, settleFullPage } from './_helpers';

/**
 * /budget — « Mon budget » lead-magnet tool (buyers / tenants).
 *
 * Mirror of estimation.spec.ts. The page is a thin static wrapper around the
 * React island `BudgetTool` (mounted client:load). The snapshot captures the
 * tool's INITIAL state: the hero <h1> is the LCP/loading anchor (a stable
 * static element, NOT the island), and we additionally assert the island has
 * hydrated to its first step (the « buy or rent » choice buttons) before
 * snapping — so the capture is of the loaded tool, not a pre-hydration skeleton.
 *
 * Captured on the two priority projects (iPhone 12 + desktop-chromium via the
 * playwright config). FULL PAGE: the page is short and deterministic (no DB).
 *
 * LCP anchor: the hero <h1> lives inside the page's `section.bg-card` hero, so
 * we anchor `waitForLoaded` to `section.bg-card h1` — the page's own visible
 * heading, immune to any hidden third-party probe heading injected elsewhere.
 */
const HERO_H1 = 'section.bg-card h1';

test.describe('/budget (FR)', () => {
  test('loads and matches full-page snapshot', async ({ page }) => {
    await page.goto('/budget');

    // (a) LOADING assertion: hero h1 visible + fonts + network idle.
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await waitForLoaded(page, HERO_H1);

    // The island has hydrated when the first wizard step renders. The « buy or
    // rent » choice button proves interactivity.
    await expect(page.getByRole('button', { name: 'Acheter' })).toBeVisible();

    await settleFullPage(page);

    // (b) Visual snapshot — full page, tool in its initial state.
    await expect(page).toHaveScreenshot('budget-fr.png', {
      fullPage: true,
    });
  });

  // i18n variants — same static body + island, localized copy.
  for (const { lang, path, firstChoice } of [
    { lang: 'en', path: '/en/budget', firstChoice: 'Buy' },
    { lang: 'wo', path: '/wo/budget', firstChoice: 'Jënd' },
  ]) {
    test(`${lang} variant loads and matches full-page snapshot`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await waitForLoaded(page, HERO_H1);
      await expect(page.getByRole('button', { name: firstChoice })).toBeVisible();
      await settleFullPage(page);
      await expect(page).toHaveScreenshot(`budget-${lang}.png`, {
        fullPage: true,
      });
    });
  }
});
