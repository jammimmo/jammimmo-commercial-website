import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)

/**
 * E2E EN PROD — FAB WhatsApp persistant (Vague 2).
 *  - présent sur l'accueil + les pages outils (lien wa.me, bas-gauche) ;
 *  - ABSENT sur la fiche bien (qui a sa propre barre CTA collante).
 */
const FAB = 'a[data-track="whatsapp.fab.tapped"]';

test.describe('Feature en prod — FAB WhatsApp', () => {
  for (const path of ['/', '/estimation', '/biens']) {
    test(`FAB présent + lien wa.me sur ${path}`, async ({ page }) => {
      const resp = await page.goto(path);
      expect(resp?.status(), `HTTP ${path}`).toBeLessThan(400);
      const fab = page.locator(FAB);
      await expect(fab).toBeVisible();
      await expect(fab).toHaveAttribute('href', /wa\.me\//);
    });
  }

  test('FAB ABSENT sur la fiche bien (barre CTA dédiée)', async ({ page }) => {
    await page.goto('/biens');
    await page.locator('main a[href*="/biens/"]').first().waitFor({ state: 'visible', timeout: 20_000 });
    const href = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('main a[href*="/biens/"]'))
        .map((x) => x.getAttribute('href'))
        .find((h) => h && /\/biens\/.+/.test(h) && !h.endsWith('/biens') && !h.endsWith('/biens/'));
      return a || null;
    });
    expect(href, 'au moins un bien').toBeTruthy();
    await page.goto(href!);
    await expect(page.locator(FAB)).toHaveCount(0);
  });
});
