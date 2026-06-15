import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)

/**
 * E2E feature en PROD : la navigation de lecture de la landing (/).
 * Vérifie le composant PageProgress :
 *  1. barre de progression (se remplit au scroll),
 *  2. sommaire interactif (scrollspy) qui APPARAÎT au scroll après le hero,
 *     surligne dynamiquement la section, puis s'AUTO-EFFACE ~2 s après l'arrêt
 *     du scroll, et redevient cliquable au scroll suivant,
 *  3. bouton « remonter en haut » (caché en haut, visible après scroll).
 * Vidéo + trace enregistrées.
 */
test.describe('Feature en prod — navigation de lecture (landing /)', () => {
  test('barre de progression + scrollspy (auto-hide) + back-to-top', async ({ page }) => {
    const resp = await page.goto('/');
    expect(resp?.status(), 'HTTP /').toBeLessThan(400);

    const nav = page.locator('[data-section-nav]');
    const fab = page.locator('[data-back-to-top]');
    const opacity = (loc: typeof nav) => loc.evaluate((el) => getComputedStyle(el).opacity);

    // 6 pastilles dans le DOM.
    await expect(nav.locator('[data-spy-link]')).toHaveCount(6);

    // En haut de page : sommaire ET FAB cachés (opacity 0).
    await expect.poll(() => opacity(nav)).toBe('0');
    await expect.poll(() => opacity(fab)).toBe('0');

    // Scroll → le sommaire APPARAÎT + le FAB + la barre se remplit.
    await page.evaluate(() => window.scrollTo(0, 2200));
    await expect.poll(() => opacity(nav)).toBe('1');
    await expect.poll(() => opacity(fab)).toBe('1');
    const barW = await page
      .locator('[data-page-progress]')
      .evaluate((el) => parseFloat((el as HTMLElement).style.width || '0'));
    expect(barW, 'largeur barre de progression > 0').toBeGreaterThan(0);

    // Surlignage DYNAMIQUE : exactement une pastille aria-current (persiste même
    // une fois le sommaire effacé).
    await expect(page.locator('[data-spy-link][aria-current="true"]')).toHaveCount(1);

    // AUTO-HIDE : sans scroller, le sommaire s'efface ~2 s après l'arrêt.
    await expect.poll(() => opacity(nav), { timeout: 6000 }).toBe('0');

    // Au scroll suivant il redevient visible ET cliquable : un clic sur « process »
    // pose aria-current sur ce lien.
    await page.evaluate(() => window.scrollTo(0, 2350));
    await expect.poll(() => opacity(nav)).toBe('1');
    const processLink = page.locator('[data-spy-link="process"]');
    await processLink.click();
    await expect(processLink).toHaveAttribute('aria-current', 'true');

    // Back-to-top (indépendant de l'auto-hide) → revient en haut.
    await fab.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(60);
  });
});
