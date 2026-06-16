import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)

/**
 * E2E feature en PROD : la navigation de lecture de la landing (/).
 * Vérifie le composant PageProgress :
 *  1. barre de progression (se remplit au scroll),
 *  2. sommaire interactif (scrollspy) qui APPARAÎT au scroll après le hero,
 *     surligne dynamiquement la section, puis s'AUTO-EFFACE ~1 s après l'arrêt
 *     du scroll, et redevient cliquable au scroll suivant,
 *  3. bouton « remonter en haut » (caché en haut, visible après scroll).
 *
 * NB : la timeline fait un fondu d'entrée PUIS de sortie en ~1,5 s. On n'assert
 * donc JAMAIS une opacité EXACTE (valeur transitoire non capturable de façon
 * fiable) — on teste des SEUILS (visible > 0.5, caché < 0.05). Vidéo + trace.
 */
test.describe('Feature en prod — navigation de lecture (landing /)', () => {
  test('barre de progression + scrollspy (auto-hide) + back-to-top', async ({ page }) => {
    const resp = await page.goto('/');
    expect(resp?.status(), 'HTTP /').toBeLessThan(400);

    const nav = page.locator('[data-section-nav]');
    const fab = page.locator('[data-back-to-top]');
    const opacity = (loc: typeof nav) =>
      loc.evaluate((el) => parseFloat(getComputedStyle(el).opacity) || 0);

    // 6 pastilles dans le DOM.
    await expect(nav.locator('[data-spy-link]')).toHaveCount(6);

    // En haut de page : sommaire ET FAB cachés.
    await expect.poll(() => opacity(nav)).toBeLessThan(0.05);
    await expect.poll(() => opacity(fab)).toBeLessThan(0.05);

    // Scroll → le sommaire APPARAÎT + le FAB + la barre se remplit.
    await page.evaluate(() => window.scrollTo(0, 2200));
    await expect.poll(() => opacity(nav)).toBeGreaterThan(0.5);
    await expect.poll(() => opacity(fab)).toBeGreaterThan(0.5);
    const barW = await page
      .locator('[data-page-progress]')
      .evaluate((el) => parseFloat((el as HTMLElement).style.width || '0'));
    expect(barW, 'largeur barre de progression > 0').toBeGreaterThan(0);

    // Surlignage DYNAMIQUE : exactement une pastille aria-current (persiste même
    // une fois le sommaire effacé).
    await expect(page.locator('[data-spy-link][aria-current="true"]')).toHaveCount(1);

    // AUTO-HIDE : sans scroller, le sommaire s'efface ~1 s après l'arrêt.
    await expect.poll(() => opacity(nav), { timeout: 6000 }).toBeLessThan(0.05);

    // Au scroll suivant il redevient visible ET cliquable. Comme la timeline
    // s'auto-efface après ~1 s, on (re)déclenche un petit scroll juste avant le
    // clic et on réessaie jusqu'à ce que le clic passe (robuste au cold-start
    // prod où le clic pourrait tomber après l'auto-hide).
    const processLink = page.locator('[data-spy-link="process"]');
    await expect(async () => {
      await page.evaluate(() => window.scrollBy(0, 40)); // ré-affiche la timeline + réarme le minuteur
      await processLink.click({ timeout: 800 });
    }).toPass({ timeout: 12_000 });
    await expect(processLink).toHaveAttribute('aria-current', 'true');

    // Back-to-top (indépendant de l'auto-hide) → revient en haut.
    await fab.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(60);
  });
});
