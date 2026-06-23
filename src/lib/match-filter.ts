/**
 * Pure catalogue filter + fit-ranking for the « Match-o-mètre » (MatchTool).
 *
 * Extracted out of MatchTool.tsx so the ranking is unit-testable. transaction is
 * a HARD filter (you can't buy a rental-only listing); type / bedrooms / budget /
 * zone are SOFT (+points) so the tool always surfaces the closest REAL matches
 * rather than an empty screen. Tiebreak: freshness (updated_at desc).
 */
import type { PublicProperty } from '@/types/property';

export type MatchTransaction = 'acheter' | 'louer';

export function transactionMatches(p: PublicProperty, tr: MatchTransaction): boolean {
  if (tr === 'acheter') {
    return p.transaction_type === 'Vente' || p.transaction_type === 'Vente & Location';
  }
  return p.transaction_type === 'Location' || p.transaction_type === 'Vente & Location';
}

/** Accent/case-insensitive normalization for free-text zone matching. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export interface MatchCriteria {
  transaction: MatchTransaction;
  /** capitalized p.type value, or undefined for "peu importe". */
  typeBiens?: string;
  /** bedroom floor as a string: '' = any, '0' = studio (floor 0), '1'..'4'. */
  bedrooms?: string;
  budgetNumber?: number;
  zone?: string;
}

/**
 * Rank the catalogue by fit and return the top `limit` real listings.
 * Soft scoring: +3 type match, +2 bedroom floor met, +2 within budget,
 * +3 zone name match (quartier or city). Pure — no network, no randomness.
 */
export function rankMatches(
  properties: PublicProperty[],
  criteria: MatchCriteria,
  limit = 3,
): PublicProperty[] {
  const tr = criteria.transaction;
  const zoneQ = norm(criteria.zone ?? '');
  // NB: '0' is a truthy string → bedroom floor 0 (studio) is an active filter,
  // matching every listing (p.bedrooms >= 0). Preserves the original behaviour.
  const bedFloor = criteria.bedrooms ? Number(criteria.bedrooms) : null;
  const budget = criteria.budgetNumber && criteria.budgetNumber > 0 ? criteria.budgetNumber : 0;

  return properties
    .filter((p) => transactionMatches(p, tr))
    .map((p) => {
      let score = 0;
      if (criteria.typeBiens && p.type === criteria.typeBiens) score += 3;
      if (bedFloor !== null && p.bedrooms >= bedFloor) score += 2;
      if (budget > 0 && p.price > 0 && p.price <= budget) score += 2;
      if (zoneQ && (norm(p.quartier).includes(zoneQ) || norm(p.city).includes(zoneQ))) score += 3;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score || (b.p.updated_at > a.p.updated_at ? 1 : -1))
    .slice(0, limit)
    .map((s) => s.p);
}
