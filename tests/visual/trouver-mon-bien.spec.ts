import { test, expect, waitForLoaded, settleFullPage } from './_helpers';

/**
 * /trouver-mon-bien — « Match-o-mètre » lead-magnet tool.
 *
 * Mirror of budget.spec.ts. Thin static wrapper around the React island
 * `MatchTool` (client:load) fed the real listings at build (empty locally ⇒ the
 * INITIAL wizard step has no data dependency, so the snapshot is stable). We
 * assert the island hydrated to its first step (buy/rent) before snapping.
 */
const HERO_H1 = 'section.bg-card h1';

test.describe('/trouver-mon-bien (FR)', () => {
  test('loads and matches full-page snapshot', async ({ page }) => {
    await page.goto('/trouver-mon-bien');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await waitForLoaded(page, HERO_H1);
    await expect(page.getByRole('button', { name: 'Acheter' })).toBeVisible();
    await settleFullPage(page);
    await expect(page).toHaveScreenshot('trouver-mon-bien-fr.png', { fullPage: true });
  });

  for (const { lang, path, firstChoice } of [
    { lang: 'en', path: '/en/trouver-mon-bien', firstChoice: 'Buy' },
    { lang: 'wo', path: '/wo/trouver-mon-bien', firstChoice: 'Jënd' },
  ]) {
    test(`${lang} variant loads and matches full-page snapshot`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await waitForLoaded(page, HERO_H1);
      await expect(page.getByRole('button', { name: firstChoice })).toBeVisible();
      await settleFullPage(page);
      await expect(page).toHaveScreenshot(`trouver-mon-bien-${lang}.png`, { fullPage: true });
    });
  }
});
