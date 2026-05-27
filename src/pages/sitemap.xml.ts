import type { APIRoute } from 'astro';
import { listAllPublicRefs } from '@/lib/supabase';

export const prerender = true;

const STATIC_PATHS = ['', '/biens', '/contact', '/comparer'];
const LANGS = ['', '/en', '/wo'];

export const GET: APIRoute = async ({ site }) => {
  const origin = (site?.toString() ?? 'https://jammimmo.com').replace(/\/$/, '');
  const refs = await listAllPublicRefs();
  const now = new Date().toISOString();

  const urls: Array<{ loc: string; lastmod?: string; priority?: string; changefreq?: string }> = [];

  // Static pages × each language
  for (const lang of LANGS) {
    for (const path of STATIC_PATHS) {
      urls.push({
        loc: `${origin}${lang}${path || '/'}`,
        lastmod: now,
        priority: path === '' ? '1.0' : '0.8',
        changefreq: path === '' || path === '/biens' ? 'daily' : 'weekly',
      });
    }
  }

  // Property detail pages × each language
  for (const lang of LANGS) {
    for (const r of refs) {
      urls.push({
        loc: `${origin}${lang}/biens/${r.reference.toLowerCase()}`,
        lastmod: r.updated_at,
        priority: '0.7',
        changefreq: 'weekly',
      });
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    ${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ''}
    ${u.priority ? `<priority>${u.priority}</priority>` : ''}
  </url>`,
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
