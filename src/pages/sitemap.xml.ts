import type { APIRoute } from 'astro';
import { listAllPublicRefs } from '@/lib/supabase.build';
import { QUARTIERS } from '@/lib/quartiers';

export const prerender = true;

const STATIC_PATHS = ['/', '/biens/', '/immobilier/', '/contact/', '/comparer/'];
/**
 * Legal pages — French canonical only. Astro's i18n fallback serves the same
 * FR markup at /en/* and /wo/*, but those alias URLs carry a canonical to
 * the FR root and are NOT emitted in the sitemap to avoid duplicate signals.
 */
const FR_ONLY_PATHS = ['/mentions-legales/', '/confidentialite/', '/cookies/'];
const LANGS: ReadonlyArray<{ prefix: string; hreflang: string }> = [
  { prefix: '',     hreflang: 'fr' },
  { prefix: '/en',  hreflang: 'en' },
  { prefix: '/wo',  hreflang: 'wo' },
];

/**
 * Build one <url> entry with <xhtml:link rel="alternate"> children for
 * every other language version + `x-default` pointing at the FR canonical.
 * Pages with a `lastmod` (properties) emit it; static pages can pass `null`.
 */
function urlBlock(
  origin: string,
  buildHref: (prefix: string) => string,
  currentPrefix: string,
  lastmod: string | null,
  priority: string,
  changefreq: string,
): string {
  const alternates = LANGS.map(
    (l) =>
      `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${origin}${buildHref(l.prefix)}"/>`,
  ).join('\n');
  const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}${buildHref('')}"/>`;
  return `  <url>
    <loc>${origin}${buildHref(currentPrefix)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
${alternates}
${xDefault}
  </url>`;
}

export const GET: APIRoute = async ({ site }) => {
  const origin = (site?.toString() ?? 'https://jammimmo.com').replace(/\/$/, '');
  const refs = await listAllPublicRefs();
  const now = new Date().toISOString();

  const blocks: string[] = [];

  // Static pages × each language. We emit one <url> per (lang × path)
  // with full xhtml:link alternates inside.
  for (const path of STATIC_PATHS) {
    for (const l of LANGS) {
      blocks.push(
        urlBlock(
          origin,
          (prefix) => `${prefix}${path}`,
          l.prefix,
          now,
          path === '/' ? '1.0' : '0.8',
          path === '/' || path === '/biens/' ? 'daily' : 'weekly',
        ),
      );
    }
  }

  // FR-only pages (legal). Plain <url> with no <xhtml:link> alternates and
  // no language prefix variants.
  for (const path of FR_ONLY_PATHS) {
    blocks.push(`  <url>
    <loc>${origin}${path}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>`);
  }

  // Geo landing pages (quartier hubs) × each language.
  for (const q of QUARTIERS) {
    for (const l of LANGS) {
      blocks.push(
        urlBlock(
          origin,
          (prefix) => `${prefix}/immobilier/${q.slug}/`,
          l.prefix,
          now,
          '0.8',
          'weekly',
        ),
      );
    }
  }

  // Property detail pages × each language.
  for (const r of refs) {
    const slug = r.reference.trim().toLowerCase();
    for (const l of LANGS) {
      blocks.push(
        urlBlock(
          origin,
          (prefix) => `${prefix}/biens/${slug}/`,
          l.prefix,
          r.updated_at ?? now,
          '0.7',
          'weekly',
        ),
      );
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
${blocks.join('\n')}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
