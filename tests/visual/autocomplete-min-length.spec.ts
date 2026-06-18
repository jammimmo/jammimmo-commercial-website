import { test, expect } from './_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)
import type { Locator, Page } from '@playwright/test';

/**
 * Standard site du sélecteur de lieu (PlaceAutocomplete), partagé par
 * Estimation (#est-quartier), Budget (#bud-zone), Match-o-mètre (#match-zone) :
 *  1. aucune suggestion sous MIN_QUERY_CHARS (= 3) caractères ;
 *  2. à partir de 3, chaque suggestion affiche le NOM + sa VILLE de rattachement
 *     (« commune · région ») — la demande « show the corresponding city » ;
 *  3. choisir une suggestion n'écrit que le nom propre dans le champ.
 *
 * Combobox maison (pas un <datalist> natif, dont le libellé secondaire est
 * invisible sur iOS) → le texte de ville est de vrais nœuds DOM, donc testable.
 * Catalogue de lieux = JSON bundlé (aucune dépendance DB) → fiable en dev.
 */
async function hydrationSafeClick(btn: Locator) {
  await expect(async () => {
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

async function assertPicker(
  page: Page,
  inputSel: string,
  listboxSel: string,
  twoChars: string,
  threeChars: string,
) {
  const input = page.locator(inputSel);
  const options = page.locator(`${listboxSel} [data-place-option]`);
  await input.click();

  // 2 lettres : rien (sous le seuil de 3).
  await input.fill(twoChars);
  await expect.poll(() => options.count()).toBe(0);

  // 3 lettres : des suggestions, chacune avec sa VILLE (commune · région) non vide.
  await input.fill(threeChars);
  await expect.poll(() => options.count()).toBeGreaterThan(0);
  const cities = await page.locator(`${listboxSel} [data-place-city]`).allInnerTexts();
  expect(cities.length).toBeGreaterThan(0);
  expect(cities.every((c) => c.trim().length > 0), 'chaque suggestion montre une ville').toBe(true);
}

test.describe('Sélecteur de lieu — seuil 3 lettres + ville affichée', () => {
  test('/estimation (#est-quartier) + Almadies → Ngor, Dakar', async ({ page }) => {
    await page.goto('/estimation');
    const appart = page.getByRole('button', { name: 'Appartement' });
    await expect(appart).toBeVisible({ timeout: 15_000 });
    await hydrationSafeClick(appart);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Vendre' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await assertPicker(page, '#est-quartier', '#est-quartier-listbox', 'al', 'alm');

    // L'entrée canonique « Almadies » existe et affiche bien sa ville = Ngor, Dakar.
    const almadies = page
      .locator('#est-quartier-listbox [data-place-option]')
      .filter({ has: page.locator('[data-place-name]', { hasText: /^Almadies$/ }) });
    await expect(almadies).toHaveCount(1);
    await expect(almadies.locator('[data-place-city]')).toHaveText('Ngor, Dakar');

    // Choisir « Almadies » n'écrit QUE le nom propre dans le champ (matching/lead inchangés).
    await almadies.click();
    await expect(page.locator('#est-quartier')).toHaveValue('Almadies');
    await expect(page.locator('#est-quartier-listbox')).toHaveCount(0); // liste fermée
  });

  test('/budget (#bud-zone)', async ({ page }) => {
    await page.goto('/budget');
    const buy = page.getByRole('button', { name: 'Acheter' });
    await expect(buy).toBeVisible({ timeout: 15_000 });
    await hydrationSafeClick(buy);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.locator('#bud-amount').fill('50000000');
    await page.getByRole('button', { name: 'Continuer' }).click();

    await assertPicker(page, '#bud-zone', '#bud-zone-listbox', 'al', 'alm');
  });
});
