import { test, expect } from './_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)
import type { Locator, Page } from '@playwright/test';

/**
 * Standard site : un autocomplete de lieu ne propose RIEN tant que l'utilisateur
 * n'a pas tapé au moins `MIN_QUERY_CHARS` (= 3) caractères ; à partir de 3 il
 * propose les communes/quartiers correspondants. Implémenté une seule fois dans
 * `filterPlaces` (src/lib/places.ts) → appliqué à TOUS les pickers de lieu :
 * Estimation (#est-quartier), Budget (#bud-zone), Match-o-mètre (#match-zone).
 *
 * Ce test n'est PAS un snapshot (aucune baseline) : il vérifie le COMPORTEMENT
 * (nombre d'options du <datalist>) sur le serveur dev. Le catalogue de lieux est
 * un JSON bundlé (aucune dépendance DB) → fiable même sans secrets.
 *
 * NB : on n'assert jamais une valeur transitoire — on poll le nombre d'options
 * pour laisser le <datalist> contrôlé par React se re-rendre après chaque saisie.
 */

// Clic robuste à l'hydratation : le bouton SSR est focusable avant que le
// onClick de l'île React soit attaché → on re-clique jusqu'à ce que la
// sélection prenne (aria-pressed), comme les specs e2e du funnel.
async function hydrationSafeClick(btn: Locator) {
  await expect(async () => {
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

// Cœur de l'assertion, réutilisé pour chaque outil : 2 lettres → 0 suggestion,
// 3 lettres → au moins une suggestion (dont le quartier attendu).
async function assertMinThreeStandard(
  page: Page,
  inputSel: string,
  datalistSel: string,
  twoChars: string, // préfixe de 2 lettres (sous le seuil)
  threeChars: string, // préfixe de 3 lettres (au seuil)
) {
  const input = page.locator(inputSel);
  const options = page.locator(`${datalistSel} option`);

  // Champ vide : aucune suggestion (fini le « tout afficher » au focus).
  await expect.poll(() => options.count()).toBe(0);

  // 2 lettres : toujours rien (sous le seuil de 3).
  await input.fill(twoChars);
  await expect.poll(() => options.count()).toBe(0);

  // 3 lettres : des suggestions apparaissent, ET chacune correspond vraiment à
  // la requête (le <datalist> filtre, il ne déverse pas tout le catalogue).
  await input.fill(threeChars);
  await expect.poll(() => options.count()).toBeGreaterThan(0);
  const values = await options.evaluateAll((els) =>
    els.map((o) => (o as HTMLOptionElement).value),
  );
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  expect(values.every((v) => norm(v).includes(threeChars))).toBe(true);
}

test.describe('Standard autocomplete — suggestions à partir de 3 lettres', () => {
  test('/estimation — picker de quartier (#est-quartier)', async ({ page }) => {
    await page.goto('/estimation');
    const appart = page.getByRole('button', { name: 'Appartement' });
    await expect(appart).toBeVisible({ timeout: 15_000 });
    await hydrationSafeClick(appart);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Vendre' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await assertMinThreeStandard(page, '#est-quartier', '#est-quartier-list', 'al', 'alm');
  });

  test('/budget — picker de zone (#bud-zone)', async ({ page }) => {
    await page.goto('/budget');
    const buy = page.getByRole('button', { name: 'Acheter' });
    await expect(buy).toBeVisible({ timeout: 15_000 });
    await hydrationSafeClick(buy);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.locator('#bud-amount').fill('50000000');
    await page.getByRole('button', { name: 'Continuer' }).click();

    await assertMinThreeStandard(page, '#bud-zone', '#bud-zone-list', 'al', 'alm');
  });
});
