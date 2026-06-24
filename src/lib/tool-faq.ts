/**
 * FAQ registry for the funnel tool pages. Each tool maps to a number of Q&A
 * items; the actual text lives in i18n under `toolseo.<slug>.intro` and
 * `toolseo.<slug>.q{n}` / `toolseo.<slug>.a{n}`.
 *
 * WHY: the tool pages were thin JS shells — every rate/definition lived inside
 * a client:load React island, invisible to non-JS AI crawlers (GPTBot, CCBot,
 * PerplexityBot in fetch mode). This adds SERVER-RENDERED, citable Q&A prose +
 * FAQPage schema below each island, turning the agency's most differentiating
 * assets into content that classic search AND generative engines can read.
 *
 * Honesty rule (same as the tools themselves): every fiscal figure in the
 * answers is the SOURCED data from acquisition-cost.ts (CGI art. 472, Décret
 * 2006-1366, World Bank) — no invented numbers.
 */
export const TOOL_FAQ_COUNT: Record<string, number> = {
  'frais-acquisition': 4,
  'securite-fonciere': 4,
  rentabilite: 3,
  estimation: 3,
  budget: 2,
  'trouver-mon-bien': 2,
};

/** Build the i18n key list for a tool's FAQ (q/a pairs). */
export function toolFaqKeys(slug: string): Array<{ q: string; a: string }> {
  const n = TOOL_FAQ_COUNT[slug] ?? 0;
  return Array.from({ length: n }, (_, i) => ({
    q: `toolseo.${slug}.q${i + 1}`,
    a: `toolseo.${slug}.a${i + 1}`,
  }));
}
