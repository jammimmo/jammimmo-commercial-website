/**
 * Property status presentation — emoji + Tailwind color class + i18n key.
 * Ported from admin: src/lib/clientUtils.ts (PROPERTY_STATUSES_CONFIG).
 *
 * `label` is the canonical FR string (kept for any non-localized caller); the
 * localized label is resolved through `labelKey` + `t()` — see statusLabel /
 * transactionLabel / typeLabel below.
 */

import type { PropertyStatus, TransactionType } from '@/types/property';
import { t, type Lang } from './i18n';

export interface StatusBadge {
  label: string;
  labelKey: string;
  emoji: string;
  /** Tailwind classes for background + text (light mode). */
  badgeClass: string;
}

export const PROPERTY_STATUSES_CONFIG: Record<PropertyStatus, StatusBadge> = {
  Disponible: {
    label: 'Disponible',
    labelKey: 'property.status.available',
    emoji: '✅',
    badgeClass: 'bg-emerald/10 text-emerald border border-emerald/20',
  },
  'En cours de vérification': {
    label: 'En vérification',
    labelKey: 'property.status.verifying',
    emoji: '🔍',
    badgeClass: 'bg-muted text-muted-foreground border border-clay',
  },
  Proposé: {
    label: 'Proposé',
    labelKey: 'property.status.proposed',
    emoji: '📩',
    badgeClass: 'bg-ochre/10 text-ochre-foreground border border-ochre/30',
  },
  Réservé: {
    label: 'Sous offre',
    labelKey: 'property.status.reserved',
    emoji: '⏳',
    badgeClass: 'bg-ochre/15 text-ink border border-ochre/30',
  },
  'Vendu / Loué': {
    label: 'Vendu / Loué',
    labelKey: 'property.status.sold',
    emoji: '✓',
    badgeClass: 'bg-ink/85 text-background border border-ink/10',
  },
};

export function getStatusBadge(status: PropertyStatus): StatusBadge {
  return PROPERTY_STATUSES_CONFIG[status] ?? PROPERTY_STATUSES_CONFIG.Disponible;
}

/** Localized status label. */
export function statusLabel(status: PropertyStatus, lang: Lang): string {
  return t(getStatusBadge(status).labelKey, lang);
}

export interface TransactionBadge {
  label: string;
  labelKey: string;
  badgeClass: string;
}

export const TRANSACTION_CONFIG: Record<TransactionType, TransactionBadge> = {
  Vente: { label: 'À vendre', labelKey: 'property.transaction.sale', badgeClass: 'bg-primary text-primary-foreground' },
  Location: { label: 'À louer', labelKey: 'property.transaction.rent', badgeClass: 'bg-secondary text-secondary-foreground' },
  'Vente & Location': { label: 'Vente / Location', labelKey: 'property.transaction.both', badgeClass: 'bg-terra text-terra-foreground' },
};

export function getTransactionBadge(t: TransactionType): TransactionBadge {
  return TRANSACTION_CONFIG[t] ?? TRANSACTION_CONFIG.Vente;
}

/** Localized transaction label. */
export function transactionLabel(transaction: TransactionType, lang: Lang): string {
  return t(getTransactionBadge(transaction).labelKey, lang);
}

/**
 * Localized property-type label. `type` is a free-form DB string (the values
 * exceed the PropertyType union — e.g. "Chambre", "Studio"), so we look up
 * `property.type.<value>` and gracefully fall back to the raw value when no
 * translation key exists (rather than rendering the bare key).
 */
export function typeLabel(type: string, lang: Lang): string {
  const key = `property.type.${type}`;
  const v = t(key, lang);
  return v === key ? type : v;
}
