/** Deterministic public facts. The model never sees or supplies property values. */
import rawFacts from '../../data/public-property-facts-20261031.json';
import { CAPTURED_AT, PROPERTY_REVISION, safePropertyReference, validatePropertyFacts, type PropertyFact } from '../public-catalogue';
import { formatFCFA } from '../format';
import type { Lang } from '../i18n';
import type { Citation } from './types';
import { elliptical, generalInformationQuestion, explicitCatalogueSearch, requestsListingFacts } from './context';
import { catalogue } from './navigation';

const corpus = validatePropertyFacts(rawFacts);
export const PUBLIC_PROPERTY_FACTS: readonly PropertyFact[] = corpus.listings;
const byId = new Map(corpus.listings.map(row => [row.id, row]));
const byRef = new Map(corpus.listings.map(row => [row.reference.toLowerCase(), row]));
export const propertySourceId = (row: PropertyFact) => `property:${row.id}:${PROPERTY_REVISION}`;
export const PROPERTY_SOURCE_IDS = Object.freeze(corpus.listings.map(propertySourceId));
const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const FIELDS = ['title', 'description', 'price', 'surface', 'bedrooms', 'location', 'type', 'piscine', 'parking', 'jardin', 'terrasse', 'balcon', 'ascenseur', 'climatisation', 'etage', 'niveaux', 'toilettes', 'salons', 'cuisine'] as const;
type FactField = typeof FIELDS[number];
function quote(row: PropertyFact, field: FactField): string | null {
  // Exact public scalar text; short values are legitimate excerpts, not an
  // invitation to invent a longer quotation to meet editorial quote limits.
  if (field === 'title') return row.title;
  if (field === 'description') return row.description.trim() ? row.description.slice(0, 600) : null;
  if (field === 'price') return row.price > 0 ? formatFCFA(row.price) : null;
  if (field === 'surface') return row.surface > 0 ? `${row.surface} m²` : null;
  if (field === 'bedrooms') return row.bedrooms > 0 ? String(row.bedrooms) : null;
  if (field === 'location') return row.quartier || row.city || null;
  if (field === 'type') return row.type;
  const value = field === 'toilettes' ? row.features.toilettes ?? row.features.salles_de_bain : row.features[field];
  if (value === null || value === undefined || value === '' || value === 0) return null;
  return value === true ? labels[field] : value === false ? null : String(value);
}
function citation(row: PropertyFact, field: FactField): Citation | null {
  const excerpt = quote(row, field);
  return excerpt === null ? null : { id: `${propertySourceId(row)}:${field}`, title: row.title, url: row.url, quote: excerpt };
}
/** Recreate persisted values and URLs from this immutable revision only. */
export function propertyCitationFromId(id: string): Citation | null {
  const match = id.match(/^property:([a-f0-9-]{36}):([a-f0-9]{12}):([a-z]+)$/);
  if (!match || match[2] !== PROPERTY_REVISION || !FIELDS.includes(match[3] as FactField)) return null;
  const row = byId.get(match[1]); return row ? citation(row, match[3] as FactField) : null;
}
type Page = { path: string; propertyReference?: string };
function pageReference(page: Page): string | null {
  const match = page.path.replace(/\/$/, '').match(/^\/(?:(?:en|es|it|ar|wo)\/)?biens\/([^/]+)$/);
  if (!match) return null;
  try { const ref = decodeURIComponent(match[1]); return safePropertyReference(ref) ? ref.toLowerCase() : null; } catch { return null; }
}
function exactMentions(question: string): PropertyFact[] {
  const lower = question.toLowerCase();
  return corpus.listings.filter(row => {
    const ref = row.reference.toLowerCase(); let at = lower.indexOf(ref);
    while (at >= 0) {
      if (!/[\p{L}\p{N}_-]/u.test(lower[at - 1] ?? '') && !/[\p{L}\p{N}_-]/u.test(lower[at + ref.length] ?? '')) return true;
      at = lower.indexOf(ref, at + 1);
    }
    return false;
  });
}
function shortMentions(question: string) {
  const serials = [...normalize(question).matchAll(/(?:\bref(?:erence)?\.?\s*#?\s*|#)(\d{3,8})\b/g)].map(match => match[1]);
  return { present: serials.length > 0, rows: corpus.listings.filter(row => serials.includes(row.reference.match(/(\d+)$/)?.[1] ?? '')) };
}
function referenceTokens(question: string): string[] {
  return [...question.matchAll(/\b[A-Z]{2,4}-(?=[A-Z0-9_-]*\d)[A-Z0-9_-]{3,100}\b/gi)].map(match => match[0].toLowerCase());
}
const labels: Record<FactField, string> = {
  title: 'Annonce', description: 'Description publiée', price: 'Prix affiché dans l’annonce', surface: 'Surface publiée', bedrooms: 'Nombre de chambres publié', location: 'Localisation publiée', type: 'Type publié',
  piscine: 'Piscine', parking: 'Parking', jardin: 'Jardin', terrasse: 'Terrasse', balcon: 'Balcon', ascenseur: 'Ascenseur', climatisation: 'Climatisation', etage: 'Étage', niveaux: 'Niveaux', toilettes: 'Salles de bain / toilettes', salons: 'Salons', cuisine: 'Cuisine',
};
const freshness = `Données publiques capturées le ${CAPTURED_AT.slice(0, 10).split('-').reverse().join('/')} à 09:29 UTC. La disponibilité et les conditions actuelles doivent être confirmées par notre équipe.`;
export interface PropertyFactAnswer { content: string; citations: Citation[]; mode: 'sources'; handoffSuggested: boolean }
export function propertyFactAnswer(question: string, current: string, page: Page, lang: Lang, allowed: readonly string[]): PropertyFactAnswer | null {
  if (generalInformationQuestion(current)) return null;
  const pathRef = pageReference(page), declared = page.propertyReference?.toLowerCase();
  const direct = exactMentions(current), short = shortMentions(current), tokens = referenceTokens(current);
  if (explicitCatalogueSearch(current) && !direct.length && !short.present && !tokens.length) return null;
  const contextual = direct.length || short.present || tokens.length ? [] : elliptical(current) ? exactMentions(question) : [];
  const contextualTokens = elliptical(current) ? referenceTokens(question) : [];
  if (!direct.length && !short.present && !tokens.length && !contextual.length && !contextualTokens.length
    && !requestsListingFacts(current, !!(declared || pathRef))) return null;
  const unknown = tokens.some(token => !corpus.listings.some(row => row.reference.toLowerCase().includes(token)));
  let candidates: PropertyFact[] = direct.length ? direct : short.present ? short.rows : contextual;
  if (!candidates.length && !short.present && !tokens.length && !contextualTokens.length) {
    if (declared && pathRef && declared !== pathRef) candidates = [];
    else { const row = byRef.get(declared ?? pathRef ?? ''); if (row) candidates = [row]; }
  }
  if (unknown || candidates.length !== 1) {
    const ambiguous = candidates.length > 1;
    return { content: ambiguous ? 'Plusieurs annonces correspondent à cette référence. Indiquez la référence complète ou ouvrez la fiche du bien concerné ; notre équipe peut vérifier.'
      : 'Je ne retrouve pas cette annonce de façon certaine dans la capture publique du catalogue. Indiquez sa référence complète ou ouvrez sa fiche ; notre équipe peut vérifier le bien concerné.',
    citations: [catalogue(lang)], mode: 'sources', handoffSuggested: true };
  }
  const row = candidates[0];
  if (allowed.length && !allowed.includes(propertySourceId(row))) return { content: 'Les informations de cette annonce ne font pas partie des sources activées pour cet assistant. Notre équipe peut vous renseigner.', citations: [], mode: 'sources', handoffSuggested: true };
  const words = normalize(current);
  const availability = /\b(disponib[a-z]*|encore libre|reserve|vendu|loue|available|availability)\b/.test(words);
  const requested: FactField[] = [];
  if (/\b(description|decris|decrivez|details|describe)\b/.test(words)) requested.push('description');
  if (/\b(prix|loyer|cout|combien|price|rent)\b/.test(words)) requested.push('price');
  if (/\b(surface|superficie|area|size)\b/.test(words)) requested.push('surface');
  if (/\b(chambres?|bedrooms?)\b/.test(words)) requested.push('bedrooms');
  if (/\b(adresse|localisation|quartier|situe|location|address)\b/.test(words) || /\bou est\b/.test(words)) requested.push('location');
  for (const field of ['piscine', 'parking', 'jardin', 'terrasse', 'balcon', 'ascenseur', 'climatisation', 'etage', 'niveaux', 'salons', 'cuisine'] as const) if (new RegExp(`\\b${field}\\b`).test(words)) requested.push(field);
  if (/\b(toilettes?|salles? de bain|bathrooms?)\b/.test(words)) requested.push('toilettes');
  if (/\b(type|categorie)\b/.test(words)) requested.push('type');
  const unsupported = /\b(charges?|caution|garantie|proprietaire|commission|visite|negocier|bail)\b/.test(words);
  if (!requested.length && !availability && !unsupported) requested.push('price', 'surface', 'bedrooms');
  const citations: Citation[] = [], lines: string[] = [row.title]; let missing = false;
  for (const field of requested.slice(0, 3)) {
    const source = citation(row, field);
    if (!source) { lines.push(`${labels[field]} : non renseigné dans les données publiques capturées.`); missing = true; continue; }
    citations.push(source);
    let value = source.quote;
    if (field === 'location' && row.quartier && row.city) value += ' · ' + row.city;
    if (field === 'price' && row.transaction_type === 'Location') value += row.rentalPeriod
      ? ({ month: ' / mois', night: ' / nuit', week: ' / semaine' }[row.rentalPeriod]) : ' (période non précisée dans les données capturées)';
    lines.push(`${labels[field]} : ${value}.`);
  }
  if (availability) lines.push('Je ne peux pas confirmer si ce bien est encore disponible.');
  if (unsupported) lines.push('Ces conditions ne sont pas confirmées par les données publiques capturées ; notre équipe peut vérifier.');
  if (!citations.length) citations.push(citation(row, 'title')!);
  return { content: lines.join('\n') + '\n\n' + freshness, citations, mode: 'sources', handoffSuggested: availability || missing || unsupported };
}
