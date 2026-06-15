import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)

/**
 * E2E feature en PROD : la navigation de lecture de la landing (/).
 * Vérifie les 3 patterns du composant PageProgress :
 *  1. barre de progression (se remplit au scroll),
 *  2. sommaire interactif (scrollspy : 6 pastilles, clic → aria-current + saut),
 *  3. bouton « remonter en haut » (caché en haut, visible après scroll, ramène en haut).
 * Vidéo + trace enregistrées.
 */
test.describe('Feature en prod — navigation de lecture (landing /)', () => {
  test('barre de progression + scrollspy + back-to-top', async ({ page }) => {
    const resp = await page.goto('/');
    expect(resp?.status(), 'HTTP /').toBeLessThan(400);

    // Sommaire interactif présent dans le DOM : 6 pastilles.
    const nav = page.locator('[data-section-nav]');
    await expect(nav.locator('[data-spy-link]')).toHaveCount(6);

    // En haut de page : le sommaire ET le FAB sont cachés (opacity 0, fade).
    const fab = page.locator('[data-back-to-top]');
    await expect.poll(() => nav.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    await expect.poll(() => fab.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

    // Scroll bas → le sommaire (timeline) ET le FAB apparaissent + barre se remplit.
    await page.evaluate(() => window.scrollTo(0, 2200));
    await expect.poll(() => nav.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    await expect.poll(() => fab.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    const barW = await page
      .locator('[data-page-progress]')
      .evaluate((el) => parseFloat((el as HTMLElement).style.width || '0'));
    expect(barW, 'largeur barre de progression > 0').toBeGreaterThan(0);

    // Le sommaire surligne DYNAMIQUEMENT la section courante : exactement une
    // pastille porte aria-current dès qu'on est dans une section (sans clic).
    await expect(page.locator('[data-spy-link][aria-current="true"]')).toHaveCount(1);

    // Scrollspy : cliquer la pastille « process » → aria-current sur ce lien.
    const processLink = page.locator('[data-spy-link="process"]');
    await processLink.click();
    await expect(processLink).toHaveAttribute('aria-current', 'true');

    // Back-to-top → revient en haut.
    await fab.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(60);
  });
});
