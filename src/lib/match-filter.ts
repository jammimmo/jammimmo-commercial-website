/**
 * Pure catalogue filter + fit-ranking for the « Match-o-mètre » (MatchTool).
 *
 * Extracted out of MatchTool.tsx so the ranking is unit-testable. transaction is
 * a hard filter. A published price within a supplied budget takes precedence.
 * Type, bedrooms and zone rank both budget fits and other suggestions.
 * Tiebreak: freshness (updated_at desc).
 */
import type { PublicProperty } from '@/types/property';
import { publicPriceForTransaction } from './public-listing-price';

export type MatchTransaction = 'acheter' | 'louer';

export function matchBudgetStatus(p: PublicProperty, transaction: MatchTransaction, budget = 0) {
  if (!Number.isFinite(budget) || budget <= 0) return 'not_set';
  const price = publicPriceForTransaction(p, transaction === 'acheter' ? 'Vente' : 'Location');
  if (price === null) return 'unknown';
  return price <= budget ? 'fit' : 'over';
}

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
 * Within each budget group: +3 type match, +2 bedroom floor met,
 * +3 zone name match (quartier or city).
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

  return properties
    .filter((p) => transactionMatches(p, tr))
    .map((p) => {
      let score = 0;
      if (criteria.typeBiens && p.type === criteria.typeBiens) score += 3;
      if (bedFloor !== null && p.bedrooms >= bedFloor) score += 2;
      if (zoneQ && (norm(p.quartier).includes(zoneQ) || norm(p.city).includes(zoneQ))) score += 3;
      const withinBudget = matchBudgetStatus(p, tr, criteria.budgetNumber) === 'fit';
      return { p, score, withinBudget };
    })
    // Symmetric comparator: equal score → fresher first; true tie (same score
    // AND same updated_at) → 0 so the sort stays stable/consistent.
    .sort(
      (a, b) =>
        Number(b.withinBudget) - Number(a.withinBudget) ||
        b.score - a.score ||
        (a.p.updated_at < b.p.updated_at ? 1 : a.p.updated_at > b.p.updated_at ? -1 : 0),
    )
    .slice(0, limit)
    .map((s) => s.p);
}
