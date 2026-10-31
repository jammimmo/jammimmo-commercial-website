import { t, LANGS, localizedPath, type Lang } from '../i18n';
import { TOOL_FAQ_COUNT } from '../tool-faq';
import type { ChatSource, Citation } from './types';
import { searchCitationFromId } from './navigation';
import { PROPERTY_SOURCE_IDS, propertyCitationFromId } from './property-facts';

// Raw published editorial files only. No DB reader, filesystem/runtime crawl,
// uploaded document, private page or model-supplied URL enters this corpus.
const guides = import.meta.glob('/src/content/guides/**/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
export function plain(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^ {0,3}(?:#{1,6}[ \t]+|>[ \t]+|[-*][ \t]+)/gm, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
}
function sourceList(): ChatSource[] {
  const result: ChatSource[] = [];
  for (const [path, raw] of Object.entries(guides).sort(([a], [b]) => a.localeCompare(b))) {
    const match = path.match(/\/guides\/([a-z0-9-]+)\/([a-z]{2})\.md$/);
    if (!match || !LANGS.includes(match[2] as Lang)) continue;
    const [, slug, lang] = match;
    const front = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/); if (!front) continue;
    const title = front[1].match(/^title:\s*["']?([^\n]+?)["']?\s*$/m)?.[1]?.replace(/^['"]|['"]$/g, '') ?? slug;
    const revision = front[1].match(/^(?:updated|date):\s*["']?([0-9-]+)/m)?.[1] ?? 'date-non-renseignee';
    const paragraphs = raw.slice(front[0].length).split(/\r?\n\s*\r?\n/).map(plain)
      .filter(v => v.length >= 70 && !/^sources?\s*:/i.test(v));
    for (let i = 0; i < Math.min(paragraphs.length, 30); i++) {
      // Only a whole paragraph prefix, never a synthesized factual paraphrase.
      const text = paragraphs[i].slice(0, 900);
      result.push({ id: `guide:${slug}:${lang}:${i}`, title, lang, revision, text,
        url: `https://jammimmo.com${localizedPath('/guides/' + slug, lang as Lang)}/` });
    }
  }
  for (const lang of LANGS) {
    for (let i = 1; i <= 6; i++) result.push({ id: `faq:${lang}:${i}`, lang, revision: 'release14eca',
      title: t(`faq.q${i}`, lang), text: plain(t(`faq.a${i}`, lang)), url: `https://jammimmo.com${localizedPath('/', lang)}#faq` });
    for (const key of ['sale', 'rent', 'manage', 'project']) result.push({ id: `service:${lang}:${key}`, lang, revision: 'release14eca',
      title: plain(t(`service.${key}.title`, lang)), text: plain(t(`service.${key}.desc`, lang)), url: `https://jammimmo.com${localizedPath('/', lang)}#services` });
    for (const [slug, count] of Object.entries(TOOL_FAQ_COUNT)) {
      for (let i = 1; i <= count; i++) result.push({ id: `tool:${lang}:${slug}:${i}`, lang, revision: 'release14eca',
        title: plain(t(`toolseo.${slug}.q${i}`, lang)), text: plain(t(`toolseo.${slug}.a${i}`, lang)),
        url: `https://jammimmo.com${localizedPath('/' + slug, lang)}/` });
    }
  }
  return result.filter(s => s.text && s.title && !s.text.startsWith('toolseo.') && !s.text.startsWith('service.'));
}
export const CHAT_SOURCES: readonly ChatSource[] = Object.freeze(sourceList());
export const CHAT_SOURCE_IDS: readonly string[] = Object.freeze([...CHAT_SOURCES.map(s => s.id), ...PROPERTY_SOURCE_IDS]);
const normalized = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const STOP = new Set(['avec', 'pour', 'dans', 'cette', 'quel', 'quelle', 'quels', 'quelles', 'bonjour', 'comment', 'vous', 'nous', 'sont', 'plus', 'avoir', 'pouvez', 'savoir', 'merci', 'aussi', 'alors', 'cela', 'bien', 'biens', 'est', 'que', 'une', 'sur', 'les', 'des', 'vos', 'nos', 'cet', 'pas', 'tous', 'suis', 'peut']);
const synonyms: Record<string, string[]> = { louer: ['location', 'loyer'], acheter: ['achat', 'acquisition'], vendre: ['vente'], notaire: ['acquisition', 'frais'], diaspora: ['etranger', 'distance'], gerer: ['gestion'], immobilier: ['bien'], rendement: ['rentabilite'], cout: ['frais', 'budget'], coute: ['frais', 'prix'], mandat: ['procuration', 'mandataire'] };
export function language(path: string): Lang { const head = path.split('/')[1]; return LANGS.includes(head as Lang) ? head as Lang : 'fr'; }
export function retrieve(question: string, lang: Lang, allowed: readonly string[], current = question): ChatSource[] {
  const words = (value: string) => normalized(value).match(/[\p{L}\p{N}]+/gu)?.filter(w => w.length >= 3 && !STOP.has(w)) ?? [];
  const expand = (value: string) => [...new Set(words(value).flatMap(w => [w, ...(synonyms[w] ?? [])]))];
  const tokens = expand(question), primary = expand(current);
  if (!tokens.length || !primary.length) return [];
  const scores = CHAT_SOURCES.filter(s => s.lang === lang && (!allowed.length || allowed.includes(s.id))).map(source => {
    const title = normalized(source.title), body = normalized(source.text);
    const currentScore = primary.reduce((sum, w) => sum + (title.includes(w) ? 5 : 0) + (body.includes(w) ? 3 : 0), 0);
    // Recent subject resolves pronouns; the new question retains more weight
    // than that context, so "et le mandat ?" does not repeat the diaspora intro.
    return { source, currentScore, score: currentScore + tokens.reduce((sum, w) => sum + (title.includes(w) ? 2 : 0) + (body.includes(w) ? 1 : 0), 0) };
  }).filter(s => s.currentScore > 0 && s.score >= 2).sort((a, b) => b.score - a.score || a.source.id.localeCompare(b.source.id));
  return scores.slice(0, 3).map(s => s.source);
}
export const citation = (s: ChatSource, quote = s.text.slice(0, 600)): Citation => ({ id: s.id, title: s.title, url: s.url, quote });
export function publicCitations(raw: string): Citation[] {
  let items: unknown; try { items = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(items)) return [];
  const result: Citation[] = [];
  for (const item of items.slice(0, 3)) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.quote !== 'string' || item.quote.length > 900) continue;
    const property = propertyCitationFromId(item.id);
    if (property) { if (property.quote === item.quote) result.push(property); continue; }
    if (item.quote.length < 20) continue;
    const search = searchCitationFromId(item.id);
    if (search) { if (search.quote === item.quote) result.push(search); continue; }
    const source = CHAT_SOURCES.find(s => s.id === item.id);
    if (source && source.text.includes(item.quote)) result.push(citation(source, item.quote));
  }
  return result;
}
export function quotedAnswer(citations: readonly Citation[]) {
  return 'Bien sûr. Voici le passage utile publié sur notre site :\n\n' + citations.map(c => `« ${c.quote} »`).join('\n\n');
}
export function sourceAnswer(sources: ChatSource[]) {
  return sources.length ? quotedAnswer([citation(sources[0])])
    : 'Je ne trouve pas de réponse suffisamment précise dans les informations publiées du site. Vous pouvez consulter nos biens ou demander un conseiller. La disponibilité d’un bien doit être confirmée par notre équipe.';
}
export function wantsHuman(text: string) {
  const value = normalized(text).replace(/['’]/g, ' ').replace(/\s+/g, ' ').trim();
  const person = '(?:humain|conseiller|conseillere|agent|operateur|human|person|personne|advisor|quelqu un|someone|somebody)';
  const filler = '(?:(?:a|avec|un|une|d|de|votre|notre|to|with|an|the|vrai|vraie|real|live|directement) )';
  return new RegExp(`\\b(?:parler|joindre|contacter|contacte|talk|speak|contact) ${filler}{0,8}${person}\\b`).test(value)
    || new RegExp(`\\b(?:veux|souhaite|voudrais|aimerais|besoin|want|need) ${filler}{0,8}${person}\\b`).test(value)
    || new RegExp(`^(?:un |une |a )?(?:vraie? |real )?${person}(?: (?:s il vous plait|please))?[?!. ]*$`).test(value)
    || /\b(?:rappelez|rappelle|rappeler|appelez|call)[ -](?:moi|me)\b/.test(value);
}
