import { defineCollection, z } from 'astro:content';

/**
 * « Guides » — long-form, sourced editorial content (the linkable/citable assets
 * the site lacked). French-primary (Senegal-specific legal/fiscal content);
 * served at /en/ /wo/ via Astro's i18n fallback, canonical to the FR URL.
 *
 * Markdown body = pure prose (no MDX needed). The [slug].astro layout wraps it
 * with the byline, Article + FAQPage + BreadcrumbList JSON-LD, a related-tool
 * CTA and internal links. Dates are ISO strings in frontmatter (no Date.now,
 * which is unavailable at build).
 */
const guides = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** ISO date (YYYY-MM-DD), provided in frontmatter. */
    date: z.string(),
    updated: z.string().optional(),
    author: z.string().default('Jamm Immobilier'),
    /** short category label shown on the card + page. */
    category: z.string().default('Guide'),
    /** ordering weight on the hub (lower first); ties break by date desc. */
    order: z.number().default(0),
    /** related funnel tool → CTA card after the article. */
    relatedTool: z
      .object({ href: z.string(), label: z.string(), cta: z.string() })
      .optional(),
    /** FAQ pairs → visible <dl> + FAQPage schema (same text). */
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    /** related quartier slugs → internal links block. */
    relatedQuartiers: z.array(z.string()).default([]),
  }),
});

export const collections = { guides };
