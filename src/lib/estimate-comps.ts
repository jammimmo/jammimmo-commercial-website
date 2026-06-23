/**
 * Comparable-listings price engine for the upgraded /estimation tool.
 *
 * HONESTY STANCE (unchanged from the original tool): we never invent a price/m²
 * grid. Instead we surface the price spread of REAL, comparable Jamm listings —
 * same type + transaction, in the same quartier when we have enough of them,
 * otherwise widened to all listings of that type (and labelled as such via
 * `basis`). When too few comps exist we return `basis: 'none'` and the UI keeps
 * the original "free expert valuation under 24h" offer with no number shown.
 *
 * Pure: build-time catalogue in, deterministic stats out. No network, no random.
 */
import type { PublicProperty } from '@/types/property';
import { norm } from './match-filter';

export type EstimateTransaction = 'vente' | 'location';
export type CompBasis = 'quartier' | 'type' | 'none';

export interface EstimateInput {
  /** capitalized p.type value already resolved, e.g. 'Appartement'. */
  typeBiens: string;
  transaction: EstimateTransaction;
  /** free-text zone the owner typed. */
  quartier: string;
  /** m² of the property being estimated (0 when unknown). */
  surface: number;
}

export interface Comp {
  reference: string;
  title: string;
  quartier: string;
  city: string;
  price: number;
  surface: number;
  pricePerM2: number | null;
}

export interface Stat {
  low: number;
  median: number;
  high: number;
}

export interface EstimateResult {
  basis: CompBasis;
  /** number of comparable listings the stats are built from. */
  count: number;
  /** nearest comps by surface proximity (for display), up to compLimit. */
  comps: Comp[];
  /** total-price spread over the comp set. */
  range: Stat | null;
  /** price-per-m² spread (comps with surface > 0). */
  perM2: Stat | null;
  /** this property's indicative band = input.surface × perM2 spread (rounded). */
  estimate: Stat | null;
}

function transactionMatches(p: PublicProperty, tr: EstimateTransaction): boolean {
  if (tr === 'vente') {
    return p.transaction_type === 'Vente' || p.transaction_type === 'Vente & Location';
  }
  return p.transaction_type === 'Location' || p.transaction_type === 'Vente & Location';
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function statOf(values: number[]): Stat | null {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  return { low: v[0]!, median: median(v), high: v[v.length - 1]! };
}

/** Round to ~2 significant figures — honest display, no spurious precision. */
export function roundNice(n: number): number {
  if (n <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

const MIN_COMPS = 3;
const COMP_LIMIT = 4;

export function estimateComps(
  properties: PublicProperty[],
  input: EstimateInput,
  opts: { minComps?: number; compLimit?: number } = {},
): EstimateResult {
  const minComps = opts.minComps ?? MIN_COMPS;
  const compLimit = opts.compLimit ?? COMP_LIMIT;

  const sameTypeTx = properties.filter(
    (p) => p.type === input.typeBiens && transactionMatches(p, input.transaction) && p.price > 0,
  );

  const zoneQ = norm(input.quartier);
  const inQuartier = zoneQ
    ? sameTypeTx.filter((p) => {
        const q = norm(p.quartier);
        return q.includes(zoneQ) || zoneQ.includes(q) || norm(p.city).includes(zoneQ);
      })
    : [];

  let basis: CompBasis;
  let pool: PublicProperty[];
  if (inQuartier.length >= minComps) {
    basis = 'quartier';
    pool = inQuartier;
  } else if (sameTypeTx.length >= minComps) {
    basis = 'type';
    pool = sameTypeTx;
  } else if (inQuartier.length > 0) {
    basis = 'quartier';
    pool = inQuartier;
  } else if (sameTypeTx.length > 0) {
    basis = 'type';
    pool = sameTypeTx;
  } else {
    return { basis: 'none', count: 0, comps: [], range: null, perM2: null, estimate: null };
  }

  const range = statOf(pool.map((p) => p.price));
  const perM2 = statOf(pool.filter((p) => p.surface > 0).map((p) => p.price / p.surface));

  let estimate: Stat | null = null;
  if (input.surface > 0 && perM2) {
    estimate = {
      low: roundNice(input.surface * perM2.low),
      median: roundNice(input.surface * perM2.median),
      high: roundNice(input.surface * perM2.high),
    };
  }

  const comps: Comp[] = [...pool]
    .sort((a, b) => Math.abs(a.surface - input.surface) - Math.abs(b.surface - input.surface))
    .slice(0, compLimit)
    .map((p) => ({
      reference: p.reference,
      title: p.title,
      quartier: p.quartier,
      city: p.city,
      price: p.price,
      surface: p.surface,
      pricePerM2: p.surface > 0 ? Math.round(p.price / p.surface) : null,
    }));

  return { basis, count: pool.length, comps, range, perM2, estimate };
}
