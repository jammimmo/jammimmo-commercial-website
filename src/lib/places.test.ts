import { describe, it, expect } from 'vitest';
import { filterPlaces, norm, placeCrumbs, MIN_QUERY_CHARS, PLACES } from './places';

describe('norm', () => {
  it('lowercases, strips accents and trims', () => {
    expect(norm('  Médina ')).toBe('medina');
    expect(norm('NGÖR')).toBe('ngor');
  });
});

describe('MIN_QUERY_CHARS', () => {
  it('is the conventional 3-char threshold', () => {
    expect(MIN_QUERY_CHARS).toBe(3);
  });
});

describe('filterPlaces', () => {
  it('returns nothing below the minimum query length', () => {
    expect(filterPlaces('')).toEqual([]);
    expect(filterPlaces('da')).toEqual([]);
  });
  it('matches from 3 chars and includes the query in every result name', () => {
    const res = filterPlaces('dak');
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((p) => norm(p.name).includes('dak'))).toBe(true);
  });
  it('finds a known nationwide place (Almadies → Ngor, Dakar)', () => {
    const almadies = filterPlaces('almadies').find((p) => norm(p.name) === 'almadies');
    expect(almadies).toBeDefined();
    expect(almadies!.commune).toBe('Ngor');
    expect(almadies!.region).toBe('Dakar');
  });
  it('ranks prefix matches before substring matches', () => {
    const res = filterPlaces('dak');
    const firstContainsIdx = res.findIndex((p) => !norm(p.name).startsWith('dak'));
    const lastStartsIdx = res.map((p) => norm(p.name).startsWith('dak')).lastIndexOf(true);
    if (firstContainsIdx !== -1) expect(lastStartsIdx).toBeLessThan(firstContainsIdx);
  });
  it('respects the result cap', () => {
    expect(filterPlaces('a', 5).length).toBeLessThanOrEqual(5); // 'a' is < 3 chars → []
    expect(filterPlaces('dakar', 5).length).toBeLessThanOrEqual(5);
  });
  it('has a non-empty catalogue', () => {
    expect(PLACES.length).toBeGreaterThan(100);
  });
});

describe('placeCrumbs', () => {
  it('builds name → commune → region, deduped', () => {
    expect(placeCrumbs({ name: 'Almadies', commune: 'Ngor', region: 'Dakar' })).toEqual([
      'Almadies',
      'Ngor',
      'Dakar',
    ]);
  });
  it('drops levels equal to the name', () => {
    expect(placeCrumbs({ name: 'Ngor', commune: 'Ngor', region: 'Dakar' })).toEqual(['Ngor', 'Dakar']);
  });
});
