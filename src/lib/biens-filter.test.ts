import { describe, it, expect } from 'vitest';
import { buildBiensQuery, buildBiensLink } from './biens-filter';

describe('buildBiensQuery', () => {
  it('maps acheter → Vente and includes priceMax + type + q', () => {
    const qs = buildBiensQuery({ transaction: 'acheter', typeBiens: 'Appartement', budgetNumber: 50_000_000, zone: 'Almadies' });
    const params = new URLSearchParams(qs);
    expect(params.get('transaction')).toBe('Vente');
    expect(params.get('priceMax')).toBe('50000000');
    expect(params.get('type')).toBe('Appartement');
    expect(params.get('q')).toBe('Almadies');
  });

  it('maps louer → Location and does NOT set priceMax (rent uses a different field)', () => {
    const qs = buildBiensQuery({ transaction: 'louer', budgetNumber: 800_000 });
    const params = new URLSearchParams(qs);
    expect(params.get('transaction')).toBe('Location');
    expect(params.get('priceMax')).toBeNull();
  });

  it('omits transaction entirely when empty', () => {
    const qs = buildBiensQuery({ transaction: '', zone: 'Dakar' });
    const params = new URLSearchParams(qs);
    expect(params.get('transaction')).toBeNull();
    expect(params.get('q')).toBe('Dakar');
  });

  it('trims the zone and drops blank zones', () => {
    expect(new URLSearchParams(buildBiensQuery({ zone: '  Ngor  ' })).get('q')).toBe('Ngor');
    expect(new URLSearchParams(buildBiensQuery({ zone: '   ' })).get('q')).toBeNull();
  });

  it('ignores a zero/negative budget', () => {
    expect(new URLSearchParams(buildBiensQuery({ transaction: 'acheter', budgetNumber: 0 })).get('priceMax')).toBeNull();
  });
});

describe('buildBiensLink', () => {
  it('produces a localized path for FR (no prefix)', () => {
    expect(buildBiensLink({ transaction: 'acheter' }, 'fr')).toBe('/biens?transaction=Vente');
  });
  it('prefixes the locale for non-default languages', () => {
    expect(buildBiensLink({ transaction: 'acheter' }, 'en')).toBe('/en/biens?transaction=Vente');
  });
  it('returns a bare /biens path when there are no params', () => {
    expect(buildBiensLink({}, 'fr')).toBe('/biens');
  });
});
