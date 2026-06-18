import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)
import type { Locator, Page } from '@playwright/test';

/**
 * E2E EN PROD : standard d'autocomplete de lieu = aucune suggestion sous 3
 * lettres, suggestions filtrées à partir de 3 (cf. filterPlaces / MIN_QUERY_CHARS).
 * Vérifié en LIVE sur les deux pickers : Estimation (#est-quartier) et
 * Budget (#bud-zone). On ne soumet rien (pas de faux lead). Vidéo + trace.
 */
async function hydrationSafeClick(btn: Locator) {
  await expect(async () => {
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

async function assertMinThreeStandard(
  page: Page,
  inputSel: string,
  datalistSel: string,
  twoChars: string,
  threeChars: string,
) {
  const input = page.locator(inputSel);
  const options = page.locator(`${datalistSel} option`);

  await expect.poll(() => options.count()).toBe(0); // champ vide → rien
  await input.fill(twoChars);
  await expect.poll(() => options.count()).toBe(0); // 2 lettres → rien

  await input.fill(threeChars);
  await expect.poll(() => options.count()).toBeGreaterThan(0); // 3 lettres → suggestions
  const values = await options.evaluateAll((els) =>
    els.map((o) => (o as HTMLOptionElement).value),
  );
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  expect(values.every((v) => norm(v).includes(threeChars))).toBe(true);
}

test.describe('Feature en prod — autocomplete lieu : seuil 3 lettres', () => {
  test('/estimation (#est-quartier)', async ({ page }) => {
    const resp = await page.goto('/estimation');
    expect(resp?.status(), 'HTTP /estimation').toBeLessThan(400);
    const appart = page.getByRole('button', { name: 'Appartement' });
    await expect(appart).toBeVisible({ timeout: 15_000 });
    await hydrationSafeClick(appart);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Vendre' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await assertMinThreeStandard(page, '#est-quartier', '#est-quartier-list', 'al', 'alm');
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
    await assertMinThreeStandard(page, '#bud-zone', '#bud-zone-list', 'al', 'alm');
  });
});
