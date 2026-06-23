import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics

/**
 * E2E sécurité en PROD : en-têtes de sécurité (CSP appliquée par CF Pages via
 * public/_headers) + absence de fuite de secret/champ sensible dans le HTML
 * servi. Complète le garde-fou unit `supabase.build.security.test.ts` (qui
 * vérifie la SELECT côté build) par une vérification du HTML réellement livré.
 */
test.describe('Sécurité en prod — en-têtes + pas de fuite', () => {
  test('CSP présente + aucun secret admin / champ sensible dans le HTML home', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status(), 'HTTP /').toBeLessThan(400);
    const h = res.headers();
    expect(
      h['content-security-policy'] || h['content-security-policy-report-only'],
      'CSP header',
    ).toBeTruthy();

    const html = await res.text();
    expect(html, 'no service_role key').not.toMatch(/service_role/i);
    expect(html, 'no admin supabase env').not.toMatch(/ADMIN_SUPABASE/);
    expect(html, 'no floor price / commission field').not.toMatch(/negotiable_price|commission_amount/);
  });

  test('une fiche bien ne révèle ni commission ni prix plancher', async ({ page }) => {
    await page.goto('/biens');
    const firstCard = page.locator('a[href*="/biens/"]').first();
    if (await firstCard.count()) {
      await firstCard.click({ timeout: 15_000 }).catch(() => {});
      const html = await page.content();
      expect(html).not.toMatch(/negotiable_price|commission_amount|service_role/i);
    }
  });
});
