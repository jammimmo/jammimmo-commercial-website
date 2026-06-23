import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics

/**
 * E2E feature en PROD : la fourchette de COMPARABLES de /estimation (upgrade
 * data-backed). Le résultat affiche, quand des biens comparables existent dans
 * le catalogue, une fourchette de prix RÉELLE + le lien « voir ces biens » ;
 * sinon il garde l'offre experte honnête (aucun chiffre inventé). Le test est
 * tolérant aux deux cas (la donnée prod varie) mais exige qu'il n'y ait jamais
 * de crash et que l'offre experte reste toujours présente. On NE soumet PAS.
 */
test.describe('Feature en prod — /estimation fourchette de comparables', () => {
  test('résultat = fourchette de comparables OU offre experte, jamais de prix inventé', async ({ page }) => {
    await page.goto('/estimation');
    const appart = page.getByRole('button', { name: 'Appartement' });
    await expect(appart).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      await appart.click();
      await expect(appart).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Vendre' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.locator('#est-quartier').fill('Almadies');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.locator('#est-surface').fill('120');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: '3', exact: true }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Bon état' }).click();
    await page.getByRole('button', { name: 'Voir mon estimation' }).click();

    // L'offre experte honnête est TOUJOURS présente.
    await expect(page.getByText('Estimation chiffrée gratuite sous 24h')).toBeVisible();

    // Si des comparables existent en prod, la fourchette + le cross-sell + un
    // montant FCFA apparaissent. Sinon, fallback honnête (offre seule). Les deux
    // sont valides : on vérifie juste la cohérence quand la carte est là.
    const comps = page.getByText('Repère de marché');
    if (await comps.count()) {
      await expect(comps.first()).toBeVisible();
      await expect(page.getByText('Voir ces biens comparables')).toBeVisible();
      await expect(page.locator('body')).toContainText('FCFA');
    }
  });
});
