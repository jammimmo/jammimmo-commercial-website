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
    await expect(price).toBeVisible({ timeout: 15_000 });

    // Garde-fou hydratation : on tape puis on vérifie que la valeur formatée prend
    // (l'île client:load peut ne pas avoir attaché son onChange tout de suite).
    await expect(async () => {
      await price.fill('');
      await price.pressSequentially('100000000', { delay: 10 });
      await expect(price).toHaveValue(/100/);
    }).toPass({ timeout: 15_000 });
    await page.locator('#ry-rent').pressSequentially('1000000', { delay: 10 });

    // Résultat live : 12 M / 100 M = 12 % brut (déterministe).
    await expect(page.getByText('Votre rentabilité')).toBeVisible();
    await expect(page.getByText('12 %')).toBeVisible();

    // Pic d'intention → capture (un seul champ WhatsApp), SANS soumettre.
    await page.getByRole('button', { name: 'Être accompagné' }).click();
    await expect(page.locator('#ry-phone')).toBeVisible();
  });
});
