import { test, expect } from '../visual/_helpers'; // `test` étendu = route.abort() Clarity + /api/analytics (zéro pollution KPI)

/**
 * E2E EN PROD — release « site 6 langues + RTL + refonte fiche bien » (commit 2200349).
 *
 * Vérifie le COMPORTEMENT réel en prod (mobile-first iPhone 12 + desktop), avec vidéo/trace :
 *  - chaque locale rend `<html lang dir>` correct + le contenu localisé (pas de fuite FR) ;
 *  - le <head> expose les 6 alternates hreflang (+ x-default) ;
 *  - le sélecteur de langue (îlot React) navigue bien vers la locale choisie (desktop) ;
 *  - sur une fiche bien non-FR : le champ traduit s'affiche PAR DÉFAUT et le toggle « voir
 *    l'original » rebascule vers le texte FR d'origine (100 % client, 0 réseau) ;
 *  - l'arabe bascule réellement en RTL (dir calculé = rtl), pas juste l'attribut ;
 *  - la carte (Leaflet) charge bien le repli OSM-France HOT (tant que la clé Geoapify
 *    n'est pas posée dans l'env Cloudflare Pages — repli keyless, libre + commercial).
 *
 * Lancer : pnpm exec playwright test --config=playwright.prod.config.ts multilang-rtl
 */

const LANGS = [
  { code: 'fr', prefix: '',    dir: 'ltr', og: 'fr_SN', tagline: "L'immobilier en toute sérénité" },
  { code: 'en', prefix: '/en', dir: 'ltr', og: 'en_US', tagline: 'Real estate, complete peace of mind' },
  { code: 'wo', prefix: '/wo', dir: 'ltr', og: 'wo_SN', tagline: 'Sa alal ci kaaraange ak xel mu dal' },
  { code: 'es', prefix: '/es', dir: 'ltr', og: 'es_ES', tagline: 'Inmobiliaria, con total tranquilidad' },
  { code: 'it', prefix: '/it', dir: 'ltr', og: 'it_IT', tagline: 'Immobiliare, in tutta serenità' },
  { code: 'ar', prefix: '/ar', dir: 'rtl', og: 'ar_AR', tagline: 'العقارات بكل طمأنينة' },
] as const;

const ALTERNATES = ['fr', 'en', 'wo', 'es', 'it', 'ar', 'x-default'] as const;

test.describe('6 langues + RTL — home localisée + hreflang', () => {
  for (const L of LANGS) {
    test(`${L.code} : html lang/dir + contenu localisé + 7 alternates`, async ({ page }) => {
      const resp = await page.goto(`${L.prefix}/`);
      expect(resp?.status(), `HTTP ${L.prefix}/`).toBeLessThan(400);

      const html = page.locator('html');
      await expect(html).toHaveAttribute('lang', L.code);
      await expect(html).toHaveAttribute('dir', L.dir);

      // contenu réellement localisé (présent dans le DOM ; robuste cross-viewport)
      await expect(page.getByText(L.tagline, { exact: false }).first()).toBeAttached();

      // pas de fuite FR sur une locale non-FR
      if (L.code !== 'fr') {
        await expect(
          page.getByText("L'immobilier en toute sérénité", { exact: false }),
        ).toHaveCount(0);
      }

      // <head> : les 6 alternates + x-default
      for (const c of ALTERNATES) {
        await expect(
          page.locator(`head link[rel="alternate"][hreflang="${c}"]`),
          `hreflang ${c}`,
        ).toHaveCount(1);
      }

      // og:locale correct par langue (garde-fou : es/it/ar tombaient sur wo_SN)
      await expect(
        page.locator('head meta[property="og:locale"]'),
        `og:locale ${L.code}`,
      ).toHaveAttribute('content', L.og);
    });
  }
});

test.describe('Régression — options de formulaire localisées (anti fuite FR)', () => {
  test('es : la recherche du hero affiche des options ES, pas FR', async ({ page }) => {
    await page.goto('/es/');
    const typeSelect = page.locator('#hs-type');
    await expect(typeSelect).toBeVisible();
    // libellé traduit présent…
    await expect(typeSelect.locator('option', { hasText: 'Apartamento' })).toHaveCount(1);
    // …et aucune fuite FR ('Maison' n'existe pas en ES = 'Casa')
    await expect(typeSelect.locator('option', { hasText: 'Maison' })).toHaveCount(0);

    const budget = page.locator('#hs-budget');
    await expect(budget.locator('option', { hasText: 'Sin límite' })).toHaveCount(1);
    await expect(budget.locator('option', { hasText: 'Sans limite' })).toHaveCount(0);
  });
});

test.describe('Sélecteur de langue (îlot React) — navigue vers la locale', () => {
  test('FR → ES via le popup du switcher', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'iphone-12',
      'Le switcher React est dans le header desktop ; le mobile passe par le menu — testé en desktop.',
    );
    await page.goto('/');
    await page.locator('button[aria-label="Change language"]:visible').first().click();
    const es = page.locator('a[role="option"][href="/es"]');
    await expect(es).toBeVisible();
    await es.click();
    await expect(page).toHaveURL(/\/es(\/|$)/);
    await expect(page.getByText('Inmobiliaria, con total tranquilidad', { exact: false }).first()).toBeAttached();
  });
});

test.describe('Fiche bien — traduction par défaut + toggle « voir l’original »', () => {
  test('le champ traduit s’affiche, le toggle rebascule vers le FR d’origine', async ({ page }) => {
    await page.goto('/es/biens');
    await page.locator('main a[href*="/biens/"]').first().waitFor({ state: 'visible', timeout: 20_000 });

    const hrefs: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main a[href*="/biens/"]'))
        .map((a) => a.getAttribute('href') || '')
        .filter((h) => /\/biens\/[a-z0-9-]+/.test(h) && !/\/biens\/?$/.test(h)),
    );

    // Cherche une fiche qui a réellement un champ traduit (toutes n’ont pas de snapshot).
    let target: { url: string; field: 'title' | 'description' | 'commercial_message' } | null = null;
    for (const h of Array.from(new Set(hrefs)).slice(0, 14)) {
      const url = h.startsWith('/es') ? h : `/es${h}`;
      await page.goto(url);
      const fields = page.locator('[data-tr-field]');
      if ((await fields.count()) > 0 && (await page.locator('[data-tr-toggle]').count()) > 0) {
        const f = (await fields.first().getAttribute('data-tr-field')) as any;
        target = { url, field: f };
        break;
      }
    }
    expect(target, 'au moins une fiche /es avec un champ traduit').toBeTruthy();

    const field = page.locator(`[data-tr-field="${target!.field}"]`).first();
    const translated = (await field.innerText()).trim();
    const original = ((await field.getAttribute('data-tr-orig')) || '').trim();
    expect(original.length, 'data-tr-orig non vide').toBeGreaterThan(0);
    expect(translated, 'affiché par défaut = traduction, ≠ original FR').not.toBe(original);

    // toggle → original FR
    await page.locator('[data-tr-toggle]').first().click();
    await expect(field).toHaveText(original);
    // re-toggle → retour à la traduction
    await page.locator('[data-tr-toggle]').first().click();
    await expect(field).toHaveText(translated);
  });
});

test.describe('Arabe — RTL réellement appliqué', () => {
  test('dir calculé = rtl sur la fiche bien arabe', async ({ page }) => {
    const resp = await page.goto('/ar/biens');
    expect(resp?.status()).toBeLessThan(400);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const computed = await page.evaluate(() => getComputedStyle(document.documentElement).direction);
    expect(computed).toBe('rtl');
    // un texte arabe est bien présent (contenu, pas seulement attribut)
    await expect(page.locator('body')).toContainText(/[؀-ۿ]/);
  });
});

test.describe('Carte — fond OpenFreeMap vecteur (keyless, libre commercial)', () => {
  test('le fond vectoriel OpenFreeMap se charge (et plus aucune Geoapify / OSM-France raster)', async ({ page }) => {
    const ofm: string[] = [];
    const legacy: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (/tiles\.openfreemap\.org/.test(u)) ofm.push(u);
      if (/maps\.geoapify\.com|tile\.openstreetmap\.fr/.test(u)) legacy.push(u);
    });

    await page.goto('/biens/dkr-cite-2026-00050/');
    // La carte est un îlot `client:visible` : son wrapper (min-h-[260px]) est dans
    // le DOM dès le SSR, mais `.leaflet-container` n'existe qu'APRÈS hydratation,
    // déclenchée quand le wrapper entre dans le viewport. On scrolle donc vers le
    // WRAPPER (présent), puis on attend le conteneur Leaflet + le fond MapLibre.
    await page.locator('[class*="min-h-[260px]"]').first().scrollIntoViewIfNeeded({ timeout: 20_000 });
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });

    // OpenFreeMap charge le style JSON + glyphs + tuiles vectorielles depuis tiles.openfreemap.org
    await expect.poll(() => ofm.length, {
      message: 'requêtes tiles.openfreemap.org (style/glyphs/tuiles vecteur)',
      timeout: 20_000,
    }).toBeGreaterThan(0);
    expect(legacy.length, 'plus aucune tuile Geoapify ni OSM-France raster').toBe(0);
  });
});
