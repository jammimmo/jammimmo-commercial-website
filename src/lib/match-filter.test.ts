import { describe, it, expect } from 'vitest';
import { rankMatches, transactionMatches, norm } from './match-filter';
import type { PublicProperty } from '@/types/property';

let seq = 0;
function makeProp(p: Partial<PublicProperty>): PublicProperty {
  seq += 1;
  return {
    id: `id-${seq}`,
    reference: p.reference ?? `REF-${seq}`,
    title: p.title ?? `Bien ${seq}`,
    type: p.type ?? 'Appartement',
    transaction_type: p.transaction_type ?? 'Vente',
    status: 'Disponible',
    city: p.city ?? 'Dakar',
    quartier: p.quartier ?? 'Almadies',
    address: '',
    geo: null,
    price: p.price ?? 0,
    negotiable: false,
    commercial_message: '',
    surface: p.surface ?? 0,
    bedrooms: p.bedrooms ?? 0,
    images: [],
    video_links: [],
    attributes: {},
    commodities: [],
    nearby_commerce: [],
    documents: {},
    flux_passage: null,
    tags: [],
    description: '',
    published_at: p.published_at ?? '2026-01-01',
    updated_at: p.updated_at ?? '2026-01-01',
  } as PublicProperty;
}

describe('transactionMatches', () => {
  it('acheter matches Vente and Vente & Location only', () => {
    expect(transactionMatches(makeProp({ transaction_type: 'Vente' }), 'acheter')).toBe(true);
    expect(transactionMatches(makeProp({ transaction_type: 'Vente & Location' }), 'acheter')).toBe(true);
    expect(transactionMatches(makeProp({ transaction_type: 'Location' }), 'acheter')).toBe(false);
  });
  it('louer matches Location and Vente & Location only', () => {
    expect(transactionMatches(makeProp({ transaction_type: 'Location' }), 'louer')).toBe(true);
    expect(transactionMatches(makeProp({ transaction_type: 'Vente' }), 'louer')).toBe(false);
  });
});

describe('norm', () => {
  it('is accent/case-insensitive', () => {
    expect(norm('Médina')).toBe('medina');
  });
});

describe('rankMatches', () => {
  it('hard-filters out non-matching transactions', () => {
    const props = [
      makeProp({ reference: 'SALE', transaction_type: 'Vente' }),
      makeProp({ reference: 'RENT', transaction_type: 'Location' }),
    ];
    const out = rankMatches(props, { transaction: 'acheter' });
    expect(out.map((p) => p.reference)).toEqual(['SALE']);
  });

  it('ranks by fit: type + budget + zone score higher', () => {
    const best = makeProp({ reference: 'BEST', type: 'Villa', price: 40_000_000, quartier: 'Almadies' });
    const mid = makeProp({ reference: 'MID', type: 'Villa', price: 90_000_000, quartier: 'Yoff' });
    const weak = makeProp({ reference: 'WEAK', type: 'Appartement', price: 90_000_000, quartier: 'Pikine' });
    const out = rankMatches([weak, mid, best], {
      transaction: 'acheter',
      typeBiens: 'Villa',
      budgetNumber: 50_000_000,
      zone: 'Almadies',
    });
    expect(out[0]!.reference).toBe('BEST');
  });

  it('tiebreaks by freshness (updated_at desc)', () => {
    const older = makeProp({ reference: 'OLD', updated_at: '2026-01-01' });
    const newer = makeProp({ reference: 'NEW', updated_at: '2026-06-01' });
    const out = rankMatches([older, newer], { transaction: 'acheter' });
    expect(out[0]!.reference).toBe('NEW');
  });

  it('honours the limit', () => {
    const props = Array.from({ length: 10 }, () => makeProp({ transaction_type: 'Vente' }));
    expect(rankMatches(props, { transaction: 'acheter' }, 3)).toHaveLength(3);
  });

  it('zone match works accent-insensitively', () => {
    const a = makeProp({ reference: 'A', quartier: 'Médina' });
    const b = makeProp({ reference: 'B', quartier: 'Yoff' });
    const out = rankMatches([b, a], { transaction: 'acheter', zone: 'medina' });
    expect(out[0]!.reference).toBe('A');
  });

  it('keeps a stable order for equal score AND equal updated_at (symmetric comparator)', () => {
    const x = makeProp({ reference: 'X', updated_at: '2026-01-01' });
    const y = makeProp({ reference: 'Y', updated_at: '2026-01-01' });
    // No type/budget/zone → both score 0; same date → true tie → input order preserved.
    expect(rankMatches([x, y], { transaction: 'acheter' }).map((p) => p.reference)).toEqual(['X', 'Y']);
    expect(rankMatches([y, x], { transaction: 'acheter' }).map((p) => p.reference)).toEqual(['Y', 'X']);
  });
});
