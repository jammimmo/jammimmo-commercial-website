import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)

/**
 * E2E feature en PROD : l'outil « Mon budget » (/budget).
 * Parcourt le funnel (wizard gratuit → résultat honnête avec biens RÉELS → capture 1 champ)
 * et S'ARRÊTE AVANT submit (pas de faux lead D1 en prod). Vidéo + trace enregistrées.
 */
test.describe('Feature en prod — outil /budget', () => {
  test('wizard → résultat (biens réels, sans chiffre inventé) → capture 1 champ, sans soumettre', async ({ page }) => {
    const resp = await page.goto('/budget');
    expect(resp?.status(), 'HTTP /budget').toBeLessThan(400);

    const buy = page.getByRole('button', { name: 'Acheter' });
    await expect(buy).toBeVisible({ timeout: 15_000 });

    // Garde-fou hydratation : re-clic jusqu'à ce que la sélection prenne.
    await expect(async () => {
      await buy.click();
      await expect(buy).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.locator('#bud-amount').fill('50000000');
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.locator('#bud-zone').fill('Almadies');
    await page.getByRole('button', { name: 'Continuer' }).click();

    // type optionnel → "Peu importe" → dernière étape → résultat
    await page.getByRole('button', { name: 'Peu importe' }).click();
    await page.getByRole('button', { name: 'Voir le résultat' }).click();

    // Résultat : la valeur = biens RÉELS + sélection WhatsApp, aucun chiffre inventé.
    await expect(page.getByText('Une sélection personnalisée + des alertes sur WhatsApp')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Voir les biens dans mon budget' })).toBeVisible();

    // Pic d'intention → capture
    await page.getByRole('button', { name: 'Recevoir ma sélection sur WhatsApp' }).click();

    // UN SEUL champ requis = WhatsApp. On NE soumet PAS (pas de faux lead en prod).
    await expect(page.locator('#bud-phone')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recevoir ma sélection', exact: true })).toBeVisible();
  });
});
