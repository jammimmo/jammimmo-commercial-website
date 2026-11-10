import { describe, it, expect } from 'vitest';
import { matchBudgetStatus, rankMatches, transactionMatches, norm } from './match-filter';
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
  it('does not reward a mixed listing as within the purchase budget based on its rent', () => {
    const mixed = makeProp({ transaction_type: 'Vente & Location', price: 320_000, updated_at: '2026-06-01' });
    const sale = makeProp({ transaction_type: 'Vente', price: 40_000_000 });
    expect(rankMatches([mixed, sale], { transaction: 'acheter', budgetNumber: 50_000_000 })).toEqual([sale, mixed]);
    expect(rankMatches([mixed, sale], { transaction: 'louer', budgetNumber: 400_000 })).toEqual([mixed]);
  });

  it('ranks published budget fits before stronger alternatives and preserves the skipped-budget order', () => {
    const fit = makeProp({ type: 'Appartement', quartier: 'Yoff', price: 50_000_000 });
    const over = makeProp({ type: 'Villa', quartier: 'Médina', bedrooms: 4, price: 70_000_000 });
    const unknown = makeProp({ type: 'Villa', quartier: 'Médina', transaction_type: 'Vente & Location', price: 320_000 });
    const props = [unknown, over, fit];
    const criteria = { transaction: 'acheter', typeBiens: 'Villa', zone: 'medina', bedrooms: '4' } as const;
    expect(rankMatches(props, { ...criteria, budgetNumber: 50_000_000 })).toEqual([fit, over, unknown]);
    expect(rankMatches(props, criteria)).toEqual([over, unknown, fit]);
  });

  it('classifies the available amount for the selected transaction, including an exact rent fit', () => {
    const mixed = makeProp({ transaction_type: 'Vente & Location', price: 320_000 });
    const missingRent = makeProp({ transaction_type: 'Location', price: 0 });
    const over = makeProp({ price: 42_000_000 });
    expect(matchBudgetStatus(mixed, 'acheter', 500_000)).toBe('unknown');
    expect(matchBudgetStatus(mixed, 'louer', 320_000)).toBe('fit');
    expect(matchBudgetStatus(missingRent, 'louer', 320_000)).toBe('unknown');
    expect(matchBudgetStatus(over, 'acheter', 500_000)).toBe('over');
    expect(matchBudgetStatus(over, 'acheter')).toBe('not_set');
  });

  it('hard-filters out non-matching transactions', () => {
    const props = [
      makeProp({ reference: 'SALE', transaction_type: 'Vente' }),
      makeProp({ reference: 'RENT', transaction_type: 'Location' }),
    ];
    const out = rankMatches(props, { transaction: 'acheter' });
    expect(out.map((p) => p.reference)).toEqual(['SALE']);
  });

  it('ranks with the type and zone preferences', () => {
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
