import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)
import type { Locator, Page } from '@playwright/test';

/**
 * E2E EN PROD : sélecteur de lieu (PlaceAutocomplete) sur Estimation, Budget et
 * le hero d'accueil.
 *  1. aucune suggestion sous 3 lettres ;
 *  2. à 3 lettres, fil d'Ariane « nom › commune › région » par suggestion ;
 *  3. entrée canonique « Almadies › Ngor › Dakar » ; la choisir n'écrit que le
 *     nom propre dans le champ.
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
  const trails = await page.locator(`${listboxSel} [data-place-trail]`).allInnerTexts();
  expect(trails.length, 'fils d’Ariane').toBeGreaterThan(0);
  expect(trails.every((tr) => tr.trim().length > 0)).toBe(true);
}

async function assertAlmadiesBreadcrumb(page: Page, listboxSel: string) {
  const almadies = page
    .locator(`${listboxSel} [data-place-option]`)
    .filter({ has: page.locator('[data-place-name]', { hasText: /^Almadies$/ }) });
  await expect(almadies).toHaveCount(1);
  await expect(almadies).toContainText('›');
  await expect(almadies).toContainText('Ngor');
  await expect(almadies).toContainText('Dakar');
}

test.describe('Feature en prod — sélecteur de lieu (fil d’Ariane, seuil 3)', () => {
  test('/estimation (#est-quartier) + Almadies › Ngor › Dakar', async ({ page }) => {
    const resp = await page.goto('/estimation');
    expect(resp?.status(), 'HTTP /estimation').toBeLessThan(400);
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
    await assertAlmadiesBreadcrumb(page, '#bud-zone-listbox');
  });

  test('/ hero (#hs-city) — liste (portal) visible malgré l’overflow du hero', async ({ page }) => {
    const resp = await page.goto('/');
    expect(resp?.status(), 'HTTP /').toBeLessThan(400);
    const input = page.locator('#hs-city');
    await expect(input).toBeVisible({ timeout: 15_000 });
    const options = page.locator('#hs-city-listbox [data-place-option]');
    await expect(async () => {
      await input.fill('');
      await input.fill('alm');
      await expect(options.first()).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await assertAlmadiesBreadcrumb(page, '#hs-city-listbox');
  });
});
