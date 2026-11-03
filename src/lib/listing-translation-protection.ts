import { normalizeListingText, type ListingText } from './listing-localization';

const KEYS = ['title', 'commercial_message', 'description'] as const;
// Longest sensitive spans first, before individual numbers. These are public
// narrative literals, not permission to send any structured/private DB field.
const LITERALS = /https?:\/\/[^\s<>"']+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\bJI-[A-Z0-9]+(?:-[A-Z0-9]+)+\b|(?:\+|00)\p{Nd}[\p{Nd} .()\-]{5,}\p{Nd}|\p{Nd}+(?:[.,\u00a0\u202f ]+\p{Nd}+)*(?:%|€|\s?(?:FCFA|XOF|m²|m2|km))?/giu;
const literals = (text: string) => text.match(LITERALS) ?? [];
const sameLiterals = (a: string, b: string) => JSON.stringify(literals(a).sort()) === JSON.stringify(literals(b).sort());

export interface ProtectedListingText { text: ListingText; restore(output: unknown): ListingText }
export function protectListingText(input: ListingText): ProtectedListingText {
  const source = normalizeListingText(input), tokens = new Map<string, { field: typeof KEYS[number]; value: string }>();
  let marker = 'LTX_LITERAL';
  while (KEYS.some(key => source[key].includes(marker))) marker += '_X';
  const text: ListingText = { title: '', commercial_message: '', description: '' };
  for (const field of KEYS) text[field] = source[field].replace(LITERALS, value => {
    const token = `⟦${marker}_${tokens.size}⟧`; tokens.set(token, { field, value }); return token;
  });
  return { text, restore(output) {
    if (!output || typeof output !== 'object' || Array.isArray(output)
      || Object.keys(output).sort().join(',') !== 'commercial_message,description,title') throw new Error('translation_shape');
    // Placeholders can be longer than their literal. Apply the public field
    // limits after restoration, not to this intermediate model representation.
    const translated: ListingText = { title: '', commercial_message: '', description: '' };
    for (const key of KEYS) {
      const value = (output as Record<string, unknown>)[key];
      if (typeof value !== 'string' || value.length > 90_000) throw new Error('translation_shape');
      translated[key] = value;
    }
    for (const field of KEYS) {
      let remainder = translated[field];
      for (const [token, span] of tokens) {
        const count = remainder.split(token).length - 1;
        if (count !== (span.field === field ? 1 : 0)) throw new Error('translation_literal_count');
        remainder = remainder.split(token).join('');
      }
      if (remainder.includes(marker) || /⟦|⟧/.test(remainder) || literals(remainder).length) throw new Error('translation_invented_literal');
      for (const [token, span] of tokens) if (span.field === field) translated[field] = translated[field].split(token).join(span.value);
    }
    return validateListingTranslation(source, translated);
  } };
}
/** Revalidate durable rows too. A nonempty model response alone is no proof of
 * language quality; lexical semantics still require the planned real review. */
export function validateListingTranslation(input: ListingText, output: unknown): ListingText {
  const source = normalizeListingText(input), translated = normalizeListingText(output);
  for (const key of KEYS) {
    if ((source[key].trim().length === 0) !== (translated[key].trim().length === 0)
      || !sameLiterals(source[key], translated[key])) throw new Error('translation_fact_mismatch');
    if (source[key] === '' && translated[key] !== '') throw new Error('translation_empty_field');
  }
  return translated;
}
