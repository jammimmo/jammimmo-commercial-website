import { test, expect } from './_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)
import type { Locator, Page } from '@playwright/test';

/**
 * Standard du sélecteur de lieu (PlaceAutocomplete), partagé par Estimation
 * (#est-quartier), Budget (#bud-zone), Match (#match-zone), recherche /biens
 * (#listings-q) et hero (#hs-city) :
 *  1. aucune suggestion sous MIN_QUERY_CHARS (= 3) caractères ;
 *  2. à partir de 3, chaque suggestion affiche un FIL D'ARIANE « nom › commune ›
 *     région » (la demande : du nom tapé jusqu'à la ville) ;
 *  3. choisir une suggestion n'écrit que le nom propre dans le champ.
 *
 * Combobox maison (liste en portal/fixed → échappe à l'overflow du hero et aux
 * barres sticky), donc le fil d'Ariane est de vrais nœuds DOM, testables.
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
  await expect.poll(() => options.count()).toBe(0); // < 3 → rien

  await input.fill(threeChars);
  await expect.poll(() => options.count()).toBeGreaterThan(0);
  // chaque suggestion a un nom + un fil d'Ariane (commune/région) non vide
  const names = await page.locator(`${listboxSel} [data-place-name]`).allInnerTexts();
  expect(names.length, 'noms').toBeGreaterThan(0);
  expect(names.every((n) => n.trim().length > 0)).toBe(true);
  const trails = await page.locator(`${listboxSel} [data-place-trail]`).allInnerTexts();
  expect(trails.length, 'fils d’Ariane').toBeGreaterThan(0);
  expect(trails.every((tr) => tr.trim().length > 0)).toBe(true);
}

/** Vérifie l'entrée canonique « Almadies › Ngor › Dakar » dans une liste donnée. */
async function assertAlmadiesBreadcrumb(page: Page, listboxSel: string) {
  const almadies = page
    .locator(`${listboxSel} [data-place-option]`)
    .filter({ has: page.locator('[data-place-name]', { hasText: /^Almadies$/ }) });
  await expect(almadies).toHaveCount(1);
  await expect(almadies).toContainText('›'); // c'est bien un fil d'Ariane
  await expect(almadies).toContainText('Ngor'); // commune
  await expect(almadies).toContainText('Dakar'); // région / ville
}

test.describe('Sélecteur de lieu — seuil 3 + fil d’Ariane jusqu’à la ville', () => {
  test('/estimation (#est-quartier) + Almadies › Ngor › Dakar + sélection = nom propre', async ({ page }) => {
    await page.goto('/estimation');
    const appart = page.getByRole('button', { name: 'Appartement' });
    await expect(appart).toBeVisible({ timeout: 15_000 });
    await hydrationSafeClick(appart);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Vendre' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await assertPicker(page, '#est-quartier', '#est-quartier-listbox', 'al', 'alm');
    await assertAlmadiesBreadcrumb(page, '#est-quartier-listbox');

    const almadies = page
      .locator('#est-quartier-listbox [data-place-option]')
      .filter({ has: page.locator('[data-place-name]', { hasText: /^Almadies$/ }) });
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
    await assertAlmadiesBreadcrumb(page, '#bud-zone-listbox');
  });

  test('/ hero (#hs-city) — la liste (portal) échappe à l’overflow du hero', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('#hs-city');
    await expect(input).toBeVisible({ timeout: 15_000 });
    const options = page.locator('#hs-city-listbox [data-place-option]');
    // toPass : attend l'hydratation de l'île hero (client:visible) avant que la
    // saisie déclenche réellement l'ouverture de la liste.
    await expect(async () => {
      await input.fill('');
      await input.fill('alm');
      await expect(options.first()).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await assertAlmadiesBreadcrumb(page, '#hs-city-listbox');
  });
});
