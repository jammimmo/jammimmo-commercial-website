import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)

/**
 * E2E feature en PROD : l'outil de capture de MANDAT « Estimation express » (/estimation).
 * Parcourt tout le funnel (wizard gratuit → résultat honnête → écran de capture 1 champ),
 * et S'ARRÊTE AVANT la soumission — on ne crée PAS de faux lead dans le D1 de prod
 * (même logique que la non-pollution des KPI). Vidéo + trace enregistrées.
 */
test.describe('Feature en prod — outil /estimation (capture mandat)', () => {
  test('wizard → résultat (sans prix inventé) → capture 1 champ, sans soumettre', async ({ page }) => {
    const resp = await page.goto('/estimation');
    expect(resp?.status(), 'HTTP /estimation').toBeLessThan(400);

    // L'île est montée : la 1re question est visible (aucun gate avant l'outil).
    await expect(page.getByRole('button', { name: 'Appartement' })).toBeVisible({ timeout: 15_000 });

    // — Wizard : toutes les étapes sont gratuites et SANS contact —
    await page.getByRole('button', { name: 'Appartement' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.getByRole('button', { name: 'Vendre' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.locator('#est-quartier').fill('Almadies');
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.locator('#est-surface').fill('120');
    await page.getByRole('button', { name: 'Continuer' }).click();

    // chambres (appartement = résidentiel)
    await page.getByRole('button', { name: '2', exact: true }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    // état → dernière étape → résultat
    await page.getByRole('button', { name: 'Bon état' }).click();
    await page.getByRole('button', { name: 'Voir mon estimation' }).click();

    // — Résultat : la VALEUR est donnée AVANT toute demande, sans prix chiffré inventé —
    await expect(page.getByText('Estimation chiffrée gratuite sous 24h')).toBeVisible();

    // — Pic d'intention → écran de capture —
    await page.getByRole('button', { name: 'Recevoir mon estimation chiffrée' }).click();

    // UN SEUL champ requis = WhatsApp. On NE soumet PAS (pas de faux lead en prod).
    await expect(page.locator('#est-phone')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recevoir mon estimation', exact: true })).toBeVisible();
  });
});
