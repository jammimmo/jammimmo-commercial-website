import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)
import type { Locator, Page } from '@playwright/test';

/**
 * E2E EN PROD : sélecteur de lieu (PlaceAutocomplete) sur Estimation + Budget.
 *  1. aucune suggestion sous 3 lettres ;
 *  2. à 3 lettres, chaque suggestion affiche sa VILLE (commune · région) ;
 *  3. l'entrée canonique « Almadies » → « Ngor, Dakar » ; la choisir n'écrit que
 *     le nom propre dans le champ.
 * On ne soumet rien (pas de faux lead). Vidéo + trace.
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
  await input.fill(twoChars);
  await expect.poll(() => options.count()).toBe(0);
  await input.fill(threeChars);
  await expect.poll(() => options.count()).toBeGreaterThan(0);
  const cities = await page.locator(`${listboxSel} [data-place-city]`).allInnerTexts();
  expect(cities.length).toBeGreaterThan(0);
  expect(cities.every((c) => c.trim().length > 0), 'chaque suggestion montre une ville').toBe(true);
}

test.describe('Feature en prod — sélecteur de lieu (ville affichée, seuil 3)', () => {
  test('/estimation (#est-quartier) + Almadies → Ngor, Dakar', async ({ page }) => {
    const resp = await page.goto('/estimation');
    expect(resp?.status(), 'HTTP /estimation').toBeLessThan(400);
    const appart = page.getByRole('button', { name: 'Appartement' });
    await expect(appart).toBeVisible({ timeout: 15_000 });
    await hydrationSafeClick(appart);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Vendre' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await assertPicker(page, '#est-quartier', '#est-quartier-listbox', 'al', 'alm');

    const almadies = page
      .locator('#est-quartier-listbox [data-place-option]')
      .filter({ has: page.locator('[data-place-name]', { hasText: /^Almadies$/ }) });
    await expect(almadies).toHaveCount(1);
    await expect(almadies.locator('[data-place-city]')).toHaveText('Ngor, Dakar');
    await almadies.click();
    await expect(page.locator('#est-quartier')).toHaveValue('Almadies');
    await expect(page.locator('#est-quartier-listbox')).toHaveCount(0);
  });

  test('/budget (#bud-zone)', async ({ page }) => {
    const resp = await page.goto('/budget');
    expect(resp?.status(), 'HTTP /budget').toBeLessThan(400);
    const buy = page.getByRole('button', { name: 'Acheter' });
    await expect(buy).toBeVisible({ timeout: 15_000 });
    await hydrationSafeClick(buy);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.locator('#bud-amount').fill('50000000');
    await page.getByRole('button', { name: 'Continuer' }).click();

    await assertPicker(page, '#bud-zone', '#bud-zone-listbox', 'al', 'alm');
  });
});
