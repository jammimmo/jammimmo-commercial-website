import { LANGS, localizedPath, type Lang } from '../i18n';
import { PLACES } from '../places';
import type { Citation } from './types';

const norm = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
const TYPES = ['Appartement', 'Villa', 'Maison', 'Terrain', 'Magasin', 'Bureau', 'Hangar'] as const;
type SearchFilters = { type?: string; transaction?: string; q?: string; bedsMin?: number; priceMax?: number };
const KEYS = ['type', 'transaction', 'q', 'bedsMin', 'priceMax'];
const names = [...new Set(PLACES.map(place => place.name))].filter(name => name.length >= 3);
const nameSet = new Set(names);
const placeWords = (value: string) => norm(value).match(/[\p{L}\p{N}]+/gu) ?? [];
const placeLookup = new Map(names.map(name => [placeWords(name).join(' '), name]));
const maxPlaceWords = Math.min(12, Math.max(...[...placeLookup.keys()].map(name => name.split(' ').length)));

function query(filters: SearchFilters): string {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const value = filters[key as keyof SearchFilters];
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}
function navigation(lang: Lang, filters: SearchFilters): Citation {
  const qs = query(filters);
  const detail = [filters.type, filters.transaction === 'Vente' ? 'achat' : filters.transaction === 'Location' ? 'location' : undefined,
    filters.q, filters.bedsMin ? `au moins ${filters.bedsMin} chambre(s)` : undefined,
    filters.priceMax ? `prix maximum ${filters.priceMax.toLocaleString('fr-FR')} FCFA` : undefined].filter(Boolean).join(' · ');
  // This is a navigation instruction, not a catalogue/availability assertion.
  return { id: `search:${lang}:${qs}`, title: 'Recherche dans nos biens',
    url: `https://jammimmo.com${localizedPath('/biens', lang)}/` + (qs ? '?' + qs : ''),
    quote: detail ? `Filtres à consulter : ${detail}.` : 'Ouvrir le catalogue public des biens.' };
}
/** Rebuild saved navigation citations. No database/model supplied URL is used. */
export function searchCitationFromId(id: string): Citation | null {
  const match = id.length <= 700 && id.match(/^search:([a-z]{2}):(.*)$/);
  if (!match || !LANGS.includes(match[1] as Lang)) return null;
  const params = new URLSearchParams(match[2]);
  if ([...params.keys()].some(key => !KEYS.includes(key) || params.getAll(key).length !== 1)) return null;
  const filters: SearchFilters = {};
  const type = params.get('type'), transaction = params.get('transaction'), q = params.get('q');
  if (type !== null) { if (!TYPES.includes(type as typeof TYPES[number])) return null; filters.type = type; }
  if (transaction !== null) { if (!['Vente', 'Location'].includes(transaction)) return null; filters.transaction = transaction; }
  if (q !== null) { if (!nameSet.has(q) || q.length > 80) return null; filters.q = q; }
  for (const key of ['bedsMin', 'priceMax'] as const) {
    const raw = params.get(key); if (raw === null) continue;
    const value = Number(raw), max = key === 'bedsMin' ? 20 : 1_000_000_000_000;
    if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(value) || value > max) return null;
    filters[key] = value;
  }
  if (query(filters) !== match[2]) return null;
  return navigation(match[1] as Lang, filters);
}
/** Only explicit search criteria; never invent listings, prices, exact bedrooms or availability. */
export function propertySearch(question: string, current: string, lang: Lang): Citation | null {
  const now = norm(current), value = norm(question);
  // An elliptical legal/service question must not inherit a catalogue intent.
  if (/\b(frais|notaire|fiscal|taxe|titre foncier|securit|arnaque|jurid|gestion|gerer|commission|rendement|rentabilite)\w*/.test(now)) return null;
  const filters: SearchFilters = {};
  let lastType = -1;
  for (const type of TYPES) {
    const matches = [...value.matchAll(new RegExp(`\\b${norm(type)}s?\\b`, 'g'))];
    const last = matches.at(-1); if (last && last.index! > lastType) { filters.type = type; lastType = last.index!; }
  }
  const transactions = [...value.matchAll(/\b(achat|acheter|vente|vendre|louer|location|rental|rent|buy)\b/g)];
  const transaction = transactions.at(-1)?.[1];
  if (transaction) filters.transaction = /^(louer|location|rental|rent)$/.test(transaction) ? 'Location' : 'Vente';
  // Bounded n-gram lookups in the visitor's <=4000-character context. Do not
  // compile a new regular expression for every place on every message.
  const words = placeWords(value); let lastPlaceEnd = -1, placeLength = 0;
  for (let start = 0; start < words.length; start++) for (let count = 1; count <= maxPlaceWords && start + count <= words.length; count++) {
    const name = placeLookup.get(words.slice(start, start + count).join(' ')); if (!name || name.length > 80) continue;
    const end = start + count;
    if (end > lastPlaceEnd || (end === lastPlaceEnd && count > placeLength)) { filters.q = name; lastPlaceEnd = end; placeLength = count; }
  }
  const beds = [...value.matchAll(/\b([1-9]|1[0-9]|20)\s*(?:chambres?|bedrooms?)\b/g)].at(-1);
  if (beds) filters.bedsMin = Number(beds[1]);
  // No currency conversion or guessed scaling. FCFA is the existing filter unit.
  if (!/\b(euros?|dollars?|usd|eur|gbp)\b|[$€£]/.test(value)) {
    const budgets = [...value.matchAll(/(?:<\s*=?|moins\s+de|max(?:imum)?|budget(?:\s+de)?|under)\s*([1-9][0-9]*(?:[ \u00a0\u202f][0-9]{3})*)\s*(k|millions?)?(?=\s|\b|$)/g)];
    const budget = budgets.at(-1);
    if (budget) {
      const amount = Number(budget[1].replace(/\s/g, '')) * (budget[2] === 'k' ? 1000 : budget[2] ? 1_000_000 : 1);
      if (Number.isSafeInteger(amount) && amount > 0 && amount <= 1_000_000_000_000) filters.priceMax = amount;
    }
  }
  const explicit = /\b(cherche|recherche|trouve|catalogue|annonces?|proposez|looking|search|je veux|je souhaite)\b/.test(now);
  const criteria = !!(filters.q || filters.bedsMin || filters.priceMax);
  if (!(filters.type || filters.transaction) || (!explicit && !criteria)) return null;
  return navigation(lang, filters);
}
export function catalogue(lang: Lang): Citation { return navigation(lang, {}); }
