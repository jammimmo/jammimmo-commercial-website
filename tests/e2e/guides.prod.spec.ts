import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics

/**
 * E2E feature en PROD : la section éditoriale /guides (content collection).
 * Vérifie le hub (liste + CollectionPage), un article (Article + FAQPage +
 * barème rendu), et le cross-link bidirectionnel guide → outil.
 */
test.describe('Feature en prod — section /guides (contenu éditorial sourcé)', () => {
  test('le hub liste les guides et émet CollectionPage', async ({ page }) => {
    const resp = await page.goto('/guides');
    expect(resp?.status(), 'HTTP /guides').toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1, name: 'Guides immobiliers' })).toBeVisible();
    // ≥4 cartes-guides
    const cards = page.locator('main a[href*="/guides/"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
    expect(await page.content()).toContain('"CollectionPage"');
  });

  test('un guide rend le contenu sourcé + Article/FAQPage + CTA outil', async ({ page }) => {
    const resp = await page.goto('/guides/frais-acquisition-senegal');
    expect(resp?.status(), 'HTTP guide').toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 })).toContainText("Frais d'acquisition");
    // barème sourcé rendu (table)
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByText('4,5 %', { exact: false }).first()).toBeVisible();
    // schémas
    const html = await page.content();
    expect(html).toContain('"Article"');
    expect(html).toContain('"FAQPage"');
    expect(html).toContain('"BreadcrumbList"');
    // cross-link vers l'outil (la carte CTA du guide, pas le lien du drawer nav)
    const toolCta = page.locator('a[data-track="guide.toolCta"]');
    await expect(toolCta).toBeVisible();
    await expect(toolCta).toHaveAttribute('href', /\/frais-acquisition$/);
    // pas de fuite
    expect(html).not.toMatch(/service_role|negotiable_price|commission_amount/);
  });
});
