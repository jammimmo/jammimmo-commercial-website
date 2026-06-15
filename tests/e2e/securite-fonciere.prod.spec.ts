import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)

/**
 * E2E feature en PROD : l'outil « Sécurité foncière » (/securite-fonciere).
 * Parcourt tout le questionnaire (6 laaj gratuits, sans contact) → résultat
 * honnête (niveau de vigilance déterministe + disclaimer, sans verdict inventé)
 * → écran de capture 1 champ, et S'ARRÊTE AVANT la soumission — on ne crée PAS
 * de faux lead dans le D1 de prod (même logique que la non-pollution des KPI).
 * Vidéo + trace enregistrées.
 */
test.describe('Feature en prod — outil /securite-fonciere', () => {
  test('questionnaire → résultat (sans verdict inventé) → capture 1 champ, sans soumettre', async ({ page }) => {
    const resp = await page.goto('/securite-fonciere');
    expect(resp?.status(), 'HTTP /securite-fonciere').toBeLessThan(400);

    // L'île est montée : la 1re question est visible (aucun gate avant l'outil).
    const firstChoice = page.getByRole('button', { name: 'Un titre foncier' });
    await expect(firstChoice).toBeVisible({ timeout: 15_000 });

    // Garde-fou HYDRATATION : le bouton SSR est cliquable avant que le onClick
    // de l'île React soit attaché → on re-clique jusqu'à ce que la sélection
    // prenne (aria-pressed). Robuste desktop+mobile.
    await expect(async () => {
      await firstChoice.click();
      await expect(firstChoice).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Q2 → Q6 : on choisit le profil le plus sûr (toutes réponses rassurantes)
    // → niveau « vert », ce qui exerce aussi le rendu « aucun point de vigilance ».
    await page.getByRole('button', { name: "Oui, j'ai vu l'original" }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.getByRole('button', { name: 'Oui, les noms correspondent' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.getByRole('button', { name: 'Le propriétaire lui-même, ou un notaire' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.getByRole('button', { name: 'Dans les prix du marché' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.getByRole('button', { name: 'Oui, visité et limites/bornage vérifiés' }).click();
    await page.getByRole('button', { name: 'Voir mon diagnostic' }).click();

    // — Résultat : niveau de vigilance honnête + disclaimer (pas de verdict
    //   juridique inventé) + offre de vérification gratuite —
    await expect(page.getByText('Profil rassurant')).toBeVisible();
    await expect(page.getByText('Vérification gratuite par un expert Jamm')).toBeVisible();
    // Le disclaimer d'honnêteté DOIT être présent.
    await expect(page.getByText('Seul un contrôle à la conservation foncière', { exact: false })).toBeVisible();

    // — Pic d'intention → écran de capture —
    await page.getByRole('button', { name: 'Faire vérifier ce bien gratuitement' }).click();

    // UN SEUL champ requis = WhatsApp. On NE soumet PAS (pas de faux lead en prod).
    await expect(page.locator('#saf-phone')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Demander la vérification', exact: true })).toBeVisible();
  });
});
