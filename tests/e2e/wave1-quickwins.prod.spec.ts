import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)

/**
 * E2E EN PROD — quick wins « Vague 1 » de l'audit UX mobile :
 *  - Contact : boutons « Appeler » + « WhatsApp » (wa.me) présents.
 *  - Fiche bien : référence réelle (« Ref #… », jamais « #— ») et copiable ;
 *    prix groupé avec séparateur de milliers (« 110 000 FCFA », pas « 110000 »).
 * On ne soumet rien. Vidéo + trace.
 */
test.describe('Feature en prod — Vague 1 (WhatsApp, réf, prix)', () => {
  test('/contact — boutons Appeler + WhatsApp', async ({ page }) => {
    const resp = await page.goto('/contact');
    expect(resp?.status(), 'HTTP /contact').toBeLessThan(400);
    // Bouton WhatsApp (canal dominant) — lien wa.me.
    const wa = page.locator('#contact a[href*="wa.me"]');
    await expect(wa.first()).toBeVisible();
    // Bouton Appeler dédié.
    await expect(page.locator('a[data-track="phone.call.tapped"]')).toBeVisible();
  });

  test('fiche bien — réf réelle + copiable, prix groupé', async ({ page }) => {
    const resp = await page.goto('/biens');
    expect(resp?.status(), 'HTTP /biens').toBeLessThan(400);

    // Les cartes sont rendues par l'île React (client:load) → attendre qu'un
    // lien de fiche apparaisse avant de le lire (sinon flaky : href null).
    await page.locator('main a[href*="/biens/"]').first().waitFor({ state: 'visible', timeout: 20_000 });

    const href = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('main a[href*="/biens/"]'))
        .map((x) => x.getAttribute('href'))
        .find((h) => h && /\/biens\/.+/.test(h) && !h.endsWith('/biens') && !h.endsWith('/biens/'));
      return a || null;
    });
    expect(href, 'au moins un bien en prod').toBeTruthy();
    await page.goto(href!);

    // Référence : chip copiable, texte « Ref #… », jamais le placeholder « #— ».
    const refChip = page.locator('[data-copy-ref]');
    await expect(refChip).toBeVisible();
    const refText = (await refChip.locator('[data-copy-ref-label]').innerText()).trim();
    expect(refText).toMatch(/^Ref #/);
    expect(refText).not.toContain('#—');

    // Prix principal groupé : au moins un « N NNN … FCFA » avec séparateur d'espace.
    const body = await page.locator('body').innerText();
    expect(body, 'prix avec séparateur de milliers').toMatch(/\d{1,3}(?: \d{3})+\s*FCFA/);
  });
});
