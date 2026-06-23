/**
 * Pure builder for the `/biens` filter URL used by the funnel tools
 * (BudgetTool, MatchTool, and the upgraded EstimateTool cross-sell).
 *
 * Extracted out of the islands so the form→query mapping can be unit-tested and
 * stays identical across every tool. The mapping is the contract the listings
 * page reads (`transaction`, `priceMax`, `type`, `q`).
 */
import { localizedPath, type Lang } from './i18n';

export interface BiensFilterInput {
  /** 'acheter' → Vente, 'louer' → Location. Empty = omit. */
  transaction?: 'acheter' | 'louer' | '';
  /** the capitalized p.type value already resolved, e.g. 'Appartement'. */
  typeBiens?: string;
  /** purchase budget cap — only applied for 'acheter' (rent uses a different field). */
  budgetNumber?: number;
  /** free-text zone, written to the `q` search param. */
  zone?: string;
}

/** Build the `/biens` query string (no leading `?`). */
export function buildBiensQuery(input: BiensFilterInput): string {
  const params = new URLSearchParams();
  if (input.transaction) {
    params.set('transaction', input.transaction === 'acheter' ? 'Vente' : 'Location');
  }
  if (input.transaction === 'acheter' && input.budgetNumber && input.budgetNumber > 0) {
    params.set('priceMax', String(input.budgetNumber));
  }
  if (input.typeBiens) params.set('type', input.typeBiens);
  const zone = input.zone?.trim();
  if (zone) params.set('q', zone);
  return params.toString();
}

/** Full localized `/biens` link with the filter applied. */
export function buildBiensLink(input: BiensFilterInput, lang: Lang): string {
  const qs = buildBiensQuery(input);
  const base = localizedPath('/biens', lang);
  return qs ? `${base}?${qs}` : base;
}
