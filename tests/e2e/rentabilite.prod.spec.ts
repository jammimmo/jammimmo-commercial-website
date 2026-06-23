import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics

/**
 * E2E feature en PROD : le calculateur investisseur « Rentabilité locative »
 * (/rentabilite). Le calcul est DÉTERMINISTE (computeYield, unit-testé), donc on
 * vérifie des chiffres exacts à partir d'entrées connues — sans dépendre de la
 * donnée catalogue. On NE soumet PAS (pas de faux lead dans le D1 de prod).
 */
test.describe('Feature en prod — outil /rentabilite (calcul investisseur)', () => {
  test('prix + loyer → rendement brut/net en direct, puis capture sans soumettre', async ({ page }) => {
    const resp = await page.goto('/rentabilite');
    expect(resp?.status(), 'HTTP /rentabilite').toBeLessThan(400);

    const price = page.locator('#ry-price');
    const rent = page.locator('#ry-rent');
    await expect(price).toBeVisible({ timeout: 15_000 });

    // L'île est `client:load` : laisser l'hydratation se faire avant de taper
    // (sur chromium desktop, `fill()` programmatique ne déclenche pas toujours
    // le onChange d'un input contrôlé pendant la course d'hydratation). On tape
    // au CLAVIER (pressSequentially = vrais events input que React traite) et on
    // ré-essaie jusqu'à ce que le résultat live apparaisse. `exact` pour ne pas
    // matcher le H1 « Calculez votre rentabilité locative ».
    await page.waitForTimeout(2000);
    await expect(async () => {
      await price.click();
      await price.fill('');
      await price.pressSequentially('100000000', { delay: 12 });
      await rent.click();
      await rent.fill('');
      await rent.pressSequentially('1000000', { delay: 12 });
      await expect(page.getByText('Votre rentabilité', { exact: true })).toBeVisible({ timeout: 2500 });
    }).toPass({ timeout: 25_000 });

    // Résultat live : 12 M / 100 M = 12 % brut (déterministe). `.first()` car
    // brut ET net valent 12 % (pas de charges/taxe saisies ici).
    await expect(page.getByText('12 %').first()).toBeVisible();

    // Pic d'intention → capture (un seul champ WhatsApp), SANS soumettre.
    await page.getByRole('button', { name: 'Être accompagné' }).click();
    await expect(page.locator('#ry-phone')).toBeVisible();
  });
});
