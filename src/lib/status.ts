/**
 * Property status presentation — emoji + Tailwind color class.
 * Ported from admin: src/lib/clientUtils.ts (PROPERTY_STATUSES_CONFIG).
 */

import type { PropertyStatus, TransactionType } from '@/types/property';

export interface StatusBadge {
  label: string;
  emoji: string;
  /** Tailwind classes for background + text (light mode). */
  badgeClass: string;
}

export const PROPERTY_STATUSES_CONFIG: Record<PropertyStatus, StatusBadge> = {
  Disponible: {
    label: 'Disponible',
    emoji: '✅',
    badgeClass: 'bg-emerald/10 text-emerald border border-emerald/20',
  },
  'En cours de vérification': {
    label: 'En vérification',
    emoji: '🔍',
    badgeClass: 'bg-muted text-muted-foreground border border-clay',
  },
  Proposé: {
    label: 'Proposé',
    emoji: '📩',
    badgeClass: 'bg-ochre/10 text-ochre-foreground border border-ochre/30',
  },
  Réservé: {
    label: 'Sous offre',
    emoji: '⏳',
    badgeClass: 'bg-ochre/15 text-ink border border-ochre/30',
  },
  'Vendu / Loué': {
    label: 'Vendu / Loué',
    emoji: '✓',
    badgeClass: 'bg-ink/85 text-background border border-ink/10',
  },
};

export function getStatusBadge(status: PropertyStatus): StatusBadge {
  return PROPERTY_STATUSES_CONFIG[status] ?? PROPERTY_STATUSES_CONFIG.Disponible;
}

export interface TransactionBadge {
  label: string;
  badgeClass: string;
}

export const TRANSACTION_CONFIG: Record<TransactionType, TransactionBadge> = {
  Vente: { label: 'À vendre', badgeClass: 'bg-primary text-primary-foreground' },
  Location: { label: 'À louer', badgeClass: 'bg-secondary text-secondary-foreground' },
  'Vente & Location': { label: 'Vente / Location', badgeClass: 'bg-terra text-terra-foreground' },
};

export function getTransactionBadge(t: TransactionType): TransactionBadge {
  return TRANSACTION_CONFIG[t] ?? TRANSACTION_CONFIG.Vente;
}
