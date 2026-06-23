import { describe, it, expect } from 'vitest';
import { estimateComps, roundNice } from './estimate-comps';
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
    gps: null,
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
    published_at: '2026-01-01',
    updated_at: '2026-01-01',
  } as PublicProperty;
}

// 3 comparable Appartement/Vente in Almadies, plus noise that must be excluded.
const catalogue: PublicProperty[] = [
  makeProp({ reference: 'A', type: 'Appartement', transaction_type: 'Vente', quartier: 'Almadies', surface: 100, price: 100_000_000 }),
  makeProp({ reference: 'B', type: 'Appartement', transaction_type: 'Vente', quartier: 'Almadies', surface: 200, price: 150_000_000 }),
  makeProp({ reference: 'C', type: 'Appartement', transaction_type: 'Vente', quartier: 'Almadies', surface: 150, price: 150_000_000 }),
  makeProp({ reference: 'D', type: 'Villa', transaction_type: 'Vente', quartier: 'Almadies', surface: 300, price: 400_000_000 }), // wrong type
  makeProp({ reference: 'E', type: 'Appartement', transaction_type: 'Location', quartier: 'Almadies', surface: 90, price: 700_000 }), // wrong tx
  makeProp({ reference: 'F', type: 'Appartement', transaction_type: 'Vente', quartier: 'Almadies', surface: 80, price: 0 }), // price 0 excluded
];

describe('roundNice', () => {
  it('rounds to ~2 significant figures', () => {
    expect(roundNice(90_000_000)).toBe(90_000_000);
    expect(roundNice(123_400_000)).toBe(120_000_000);
    expect(roundNice(0)).toBe(0);
    expect(roundNice(-5)).toBe(0);
  });
});

describe('estimateComps', () => {
  it('uses the quartier basis when there are enough comps and excludes wrong type/tx/price-0', () => {
    const r = estimateComps(catalogue, { typeBiens: 'Appartement', transaction: 'vente', quartier: 'Almadies', surface: 120 });
    expect(r.basis).toBe('quartier');
    expect(r.count).toBe(3); // A, B, C only
    expect(r.range).toEqual({ low: 100_000_000, median: 150_000_000, high: 150_000_000 });
    expect(r.perM2).toEqual({ low: 750_000, median: 1_000_000, high: 1_000_000 });
    expect(r.estimate).toEqual({ low: 90_000_000, median: 120_000_000, high: 120_000_000 });
  });

  it('orders comps by surface proximity and respects the limit', () => {
    const r = estimateComps(catalogue, { typeBiens: 'Appartement', transaction: 'vente', quartier: 'Almadies', surface: 120 }, { compLimit: 2 });
    expect(r.comps).toHaveLength(2);
    expect(r.comps[0]!.reference).toBe('A'); // surface 100, closest to 120
    expect(r.comps[0]!.pricePerM2).toBe(1_000_000);
  });

  it('falls back to the type basis when the quartier has too few comps', () => {
    const r = estimateComps(catalogue, { typeBiens: 'Appartement', transaction: 'vente', quartier: 'Saly', surface: 120 });
    expect(r.basis).toBe('type');
    expect(r.count).toBe(3);
  });

  it('returns basis "none" when there are no comparable listings at all', () => {
    const r = estimateComps(catalogue, { typeBiens: 'Bureau', transaction: 'vente', quartier: 'Almadies', surface: 120 });
    expect(r.basis).toBe('none');
    expect(r.range).toBeNull();
    expect(r.estimate).toBeNull();
    expect(r.comps).toHaveLength(0);
  });

  it('omits the estimate band when surface is unknown but still returns the range', () => {
    const r = estimateComps(catalogue, { typeBiens: 'Appartement', transaction: 'vente', quartier: 'Almadies', surface: 0 });
    expect(r.estimate).toBeNull();
    expect(r.range).not.toBeNull();
    expect(r.perM2).not.toBeNull();
  });
});
