import { describe, it, expect } from 'vitest';
import {
  formatFCFA,
  formatRentalPrice,
  metaDescription,
  formatBedrooms,
  formatSurface,
  formatLocation,
  propertySeoTitle,
} from './format';

describe('formatFCFA', () => {
  it('groups thousands and appends FCFA (any single space char between groups)', () => {
    expect(formatFCFA(1234567)).toMatch(/^1\s234\s567 FCFA$/);
    expect(formatFCFA(110000)).toMatch(/^110\s000 FCFA$/);
  });
  it('omits the suffix when suffix:false', () => {
    expect(formatFCFA(5000, { suffix: false })).toMatch(/^5\s000$/);
  });
  it('returns an em dash for null/undefined/NaN', () => {
    expect(formatFCFA(null)).toBe('—');
    expect(formatFCFA(undefined)).toBe('—');
    expect(formatFCFA(Number.NaN)).toBe('—');
  });
  it('rounds fractional input', () => {
    expect(formatFCFA(1999.6)).toMatch(/^2\s000 FCFA$/);
  });
  it('handles values under 1000 without grouping', () => {
    expect(formatFCFA(750)).toBe('750 FCFA');
  });
});

describe('formatRentalPrice', () => {
  it('adds "/ mois" for Location', () => {
    expect(formatRentalPrice(850000, 'Location')).toMatch(/\/ mois$/);
  });
  it('does not add "/ mois" for Vente', () => {
    expect(formatRentalPrice(50000000, 'Vente')).not.toMatch(/mois/);
  });
});

describe('formatBedrooms', () => {
  it('returns Studio for 0 / falsy', () => {
    expect(formatBedrooms(0)).toBe('Studio');
  });
  it('formats positive counts', () => {
    expect(formatBedrooms(5)).toBe('5 ch.');
  });
});

describe('formatSurface', () => {
  it('returns em dash for non-positive', () => {
    expect(formatSurface(0)).toBe('—');
  });
  it('groups and adds m²', () => {
    expect(formatSurface(1200)).toMatch(/^1\s200 m²$/);
  });
});

describe('formatLocation', () => {
  it('joins city and quartier with a middle dot', () => {
    expect(formatLocation('Dakar', 'Almadies')).toBe('Dakar · Almadies');
  });
  it('skips empty parts', () => {
    expect(formatLocation('Dakar', '')).toBe('Dakar');
  });
});

describe('metaDescription', () => {
  it('strips emoji and collapses whitespace', () => {
    const out = metaDescription('🏡  Belle villa\n\nà   Dakar 🌅');
    expect(out).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(out).toBe('Belle villa à Dakar');
  });
  it('uses the first non-empty source', () => {
    expect(metaDescription('', '   ', 'fallback text')).toBe('fallback text');
  });
  it('caps at <=160 chars and cuts on a word boundary with an ellipsis', () => {
    const long = 'mot '.repeat(80).trim();
    const out = metaDescription(long);
    expect(out.length).toBeLessThanOrEqual(161); // 160 + ellipsis
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\smo$/); // no mid-word cut
  });
  it('returns empty string when all sources are empty', () => {
    expect(metaDescription(null, undefined, '')).toBe('');
  });
});

describe('propertySeoTitle', () => {
  it('includes surface, location, price and brand', () => {
    const title = propertySeoTitle(
      { type: 'Appartement', surface: 120, quartier: 'Almadies', city: 'Dakar', price: 250000, transaction_type: 'Location' },
      'fr',
    );
    expect(title).toContain('120m²');
    expect(title).toContain('Almadies');
    expect(title).toContain('Dakar');
    expect(title).toMatch(/\/ mois/);
    expect(title).toContain('Jamm Immobilier');
  });
});
