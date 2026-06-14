import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)

/**
 * E2E feature en PROD : les nouvelles pages /proprietaires & /partenaires.
 * Vérifie le chargement réel + le parcours funnel (CTA -> /contact?subject=…),
 * sur iPhone 12 en priorité. Vidéo + trace enregistrées (cf playwright.prod.config.ts).
 */

test.describe('Feature en prod — /proprietaires', () => {
  test('charge et le CTA mène à /contact?subject=gestion', async ({ page }) => {
    const resp = await page.goto('/proprietaires');
    expect(resp?.status(), 'HTTP /proprietaires').toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const cta = page.getByRole('link', { name: /estimation gratuite/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/contact\/?\?subject=gestion/);
    await expect(page.locator('form')).toBeVisible({ timeout: 15_000 }); // îlot React ContactForm hydrate avec un léger délai // le formulaire de contact est bien là
  });
});

test.describe('Feature en prod — /partenaires', () => {
  test('charge et le CTA mène à /contact?subject=partenariat', async ({ page }) => {
    const resp = await page.goto('/partenaires');
    expect(resp?.status(), 'HTTP /partenaires').toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const cta = page.getByRole('link', { name: /proposer une affaire/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/contact\/?\?subject=partenariat/);
    await expect(page.locator('form')).toBeVisible({ timeout: 15_000 }); // îlot React ContactForm hydrate avec un léger délai
  });
});

test.describe('Feature en prod — variantes i18n (200 + h1)', () => {
  for (const path of ['/en/proprietaires', '/wo/proprietaires', '/en/partenaires', '/wo/partenaires']) {
    test(`${path} charge correctement`, async ({ page }) => {
      const resp = await page.goto(path);
      expect(resp?.status(), `HTTP ${path}`).toBeLessThan(400);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }
});
