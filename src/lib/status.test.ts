import { describe, it, expect } from 'vitest';
import {
  getStatusBadge,
  statusLabel,
  getTransactionBadge,
  transactionLabel,
  typeLabel,
  PROPERTY_STATUSES_CONFIG,
} from './status';

describe('getStatusBadge', () => {
  it('returns the matching badge', () => {
    expect(getStatusBadge('Disponible')).toBe(PROPERTY_STATUSES_CONFIG.Disponible);
  });
  it('falls back to Disponible for an unknown status', () => {
    // @ts-expect-error testing the runtime fallback path
    expect(getStatusBadge('Inconnu')).toBe(PROPERTY_STATUSES_CONFIG.Disponible);
  });
});

describe('getTransactionBadge', () => {
  it('returns the matching badge', () => {
    expect(getTransactionBadge('Location').labelKey).toBe('property.transaction.rent');
  });
  it('falls back to Vente for an unknown transaction', () => {
    // @ts-expect-error testing the runtime fallback path
    expect(getTransactionBadge('Troc').labelKey).toBe('property.transaction.sale');
  });
});

describe('typeLabel', () => {
  it('returns the raw value when no translation key exists', () => {
    expect(typeLabel('TypeQuiNexistePas', 'fr')).toBe('TypeQuiNexistePas');
  });
  it('returns a non-empty string for known types', () => {
    expect(typeLabel('Appartement', 'fr')).toBeTruthy();
  });
});

describe('localized labels', () => {
  it('statusLabel returns a string for every configured status', () => {
    for (const status of Object.keys(PROPERTY_STATUSES_CONFIG) as Array<
      keyof typeof PROPERTY_STATUSES_CONFIG
    >) {
      expect(typeof statusLabel(status, 'fr')).toBe('string');
    }
  });
  it('transactionLabel returns a string', () => {
    expect(typeof transactionLabel('Vente', 'fr')).toBe('string');
  });
});
