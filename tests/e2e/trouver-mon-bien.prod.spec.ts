import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)

/**
 * E2E feature en PROD : l'outil « Match-o-mètre » (/trouver-mon-bien).
 * Parcourt le quiz (toutes étapes gratuites, sans contact) → résultat (3 biens
 * RÉELS classés par fit, ou état vide honnête) → capture 1 champ, et S'ARRÊTE
 * AVANT submit (pas de faux lead D1). On choisit les critères les plus larges
 * pour exercer le chemin « avec résultats ». Vidéo + trace enregistrées.
 */
test.describe('Feature en prod — outil /trouver-mon-bien', () => {
  test('quiz → biens réels (sans bien inventé) → capture 1 champ, sans soumettre', async ({ page }) => {
    const resp = await page.goto('/trouver-mon-bien');
    expect(resp?.status(), 'HTTP /trouver-mon-bien').toBeLessThan(400);

    const buy = page.getByRole('button', { name: 'Acheter' });
    await expect(buy).toBeVisible({ timeout: 15_000 });

    // Garde-fou hydratation : re-clic jusqu'à ce que la sélection prenne.
    await expect(async () => {
      await buy.click();
      await expect(buy).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Continuer' }).click();

    // type → « Peu importe » (critères larges = on exerce le chemin avec biens).
    await page.getByRole('button', { name: 'Peu importe' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    // chambres → « Peu importe ».
    await page.getByRole('button', { name: 'Peu importe' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    // budget → laissé vide.
    await page.getByRole('button', { name: 'Continuer' }).click();

    // zone → laissée vide → résultat.
    await page.getByRole('button', { name: 'Voir mes biens' }).click();

    // — Résultat : l'offre + le CTA s'affichent (présents avec OU sans biens) —
    await expect(page.getByText('Votre sélection complète + des alertes sur WhatsApp')).toBeVisible();
    const cta = page.getByRole('button', { name: 'Recevoir ma sélection sur WhatsApp' });
    await expect(cta).toBeVisible();

    // — Pic d'intention → capture —
    await cta.click();

    // UN SEUL champ requis = WhatsApp. On NE soumet PAS (pas de faux lead en prod).
    await expect(page.locator('#match-phone')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recevoir ma sélection', exact: true })).toBeVisible();
  });
});
