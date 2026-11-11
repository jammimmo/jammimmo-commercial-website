import type { PublicProperty } from '@/types/property';

type PricedListing = Pick<PublicProperty, 'price' | 'transaction_type'>;

/** The public scalar on a mixed listing is the monthly rent. The sale amount
 * lives outside the approved public projection. */
export function publicPriceForTransaction(p: PricedListing, transaction = ''): number | null {
  if (!Number.isFinite(p.price) || p.price <= 0) return null;
  if (transaction === 'Vente' && p.transaction_type !== 'Vente') return null;
  if (transaction === 'Location' && p.transaction_type === 'Vente') return null;
  return p.price;
}

export function matchesPublicPriceBounds(p: PricedListing, transaction: string, min: number, max: number): boolean {
  if (min <= 0 && max <= 0) return true;
  const price = publicPriceForTransaction(p, transaction);
  return price !== null && (min <= 0 || price >= min) && (max <= 0 || price <= max);
}

export function comparePublicPrices(a: PricedListing, b: PricedListing, transaction: string, ascending: boolean): number {
  const first = publicPriceForTransaction(a, transaction);
  const second = publicPriceForTransaction(b, transaction);
  if (first === null) return second === null ? 0 : 1;
  if (second === null) return -1;
  return ascending ? first - second : second - first;
}
