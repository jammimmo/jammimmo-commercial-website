import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics

/**
 * E2E feature en PROD : le calculateur acheteur « Frais d'acquisition »
 * (/frais-acquisition). Le calcul est DÉTERMINISTE (computeAcquisitionCost,
 * unit-testé sur des taux statutaires sourcés), donc on vérifie des chiffres
 * EXACTS à partir d'un prix connu — sans dépendre de la donnée catalogue. On NE
 * soumet PAS (pas de faux lead dans le D1 de prod).
 *
 * Prix saisi : 100 000 000 FCFA
 *   enregistrement   5 %                       = 5 000 000
 *   publicité fonc.  1 % + 6 500               = 1 006 500
 *   notaire (barème) 900k+1,8M+300k            = 3 000 000
 *   TVA 18 % notaire                            =   540 000
 *   ─────────────────────────────────────────────────────
 *   total des frais                            = 9 546 500   (9.5 %)
 *   budget total (prix + frais)                = 109 546 500
 */
test.describe('Feature en prod — outil /frais-acquisition (coût total d\'achat)', () => {
  test('prix → détail des frais en direct (chiffres exacts), puis capture sans soumettre', async ({ page }) => {
    const resp = await page.goto('/frais-acquisition');
    expect(resp?.status(), 'HTTP /frais-acquisition').toBeLessThan(400);

    const price = page.locator('#fa-price');
    await expect(price).toBeVisible({ timeout: 15_000 });

    // Île `client:load` : laisser l'hydratation se faire, puis taper au CLAVIER
    // (pressSequentially = vrais events input que React traite) et ré-essayer
    // jusqu'à ce que le résultat live apparaisse. `exact` pour ne pas matcher le
    // H1 « Calculez vos frais d'acquisition ».
    await page.waitForTimeout(2000);
    await expect(async () => {
      await price.click();
      await price.fill('');
      await price.pressSequentially('100000000', { delay: 12 });
      await expect(page.getByText('Vos frais d\'acquisition', { exact: true })).toBeVisible({ timeout: 2500 });
    }).toPass({ timeout: 25_000 });

    // Budget total = prix + frais (chiffre unique même en sous-chaîne).
    await expect(page.getByText('109 546 500 FCFA')).toBeVisible();
    // Le détail itémisé est présent (chaque ligne avec son intitulé).
    await expect(page.getByText('Droits d\'enregistrement')).toBeVisible();
    await expect(page.getByText('Honoraires du notaire')).toBeVisible();

    // Pic d'intention → capture (un seul champ WhatsApp), SANS soumettre.
    await page.getByRole('button', { name: 'Être accompagné' }).click();
    await expect(page.locator('#fa-phone')).toBeVisible();
  });
});
