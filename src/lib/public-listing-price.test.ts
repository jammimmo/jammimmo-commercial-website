import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MiniCard from '@/components/property/MiniCard';
import type { PublicProperty } from '@/types/property';
import { formatListingPrice, propertySeoTitle } from './format';
import { comparePublicPrices, matchesPublicPriceBounds, publicPriceForTransaction } from './public-listing-price';

const mixed: PublicProperty = {
  id: 'a0000000-0000-4000-8000-000000000001', reference: 'QA-MIXED-001', title: 'Villa fictive', type: 'Villa',
  transaction_type: 'Vente & Location', status: 'Disponible', city: 'Dakar', quartier: '', address: null, geo: null,
  price: 320_000, negotiable: false, commercial_message: '', surface: 100, bedrooms: 1, images: [], video_links: [],
  attributes: {}, commodities: [], nearby_commerce: [], documents: {}, flux_passage: null, tags: [], description: '',
  published_at: null, updated_at: '2026-11-10T00:00:00Z',
};

describe('public mixed-listing price', () => {
  it('keeps unpriced sale listings visible without using their rent for sale bounds', () => {
    expect(publicPriceForTransaction(mixed, 'Vente')).toBeNull();
    expect(matchesPublicPriceBounds(mixed, 'Vente', 0, 0)).toBe(true);
    expect(matchesPublicPriceBounds(mixed, 'Vente', 0, 400_000)).toBe(false);
    expect(matchesPublicPriceBounds(mixed, 'Vente', 100_000, 0)).toBe(false);
    expect(matchesPublicPriceBounds(mixed, 'Location', 300_000, 400_000)).toBe(true);
    expect(matchesPublicPriceBounds(mixed, 'Location', 321_000, 0)).toBe(false);
  });

  it('puts unknown sale prices last regardless of the direction of sort', () => {
    const sale = { ...mixed, transaction_type: 'Vente', price: 40_000_000 } as const;
    for (const ascending of [true, false]) {
      expect(comparePublicPrices(mixed, sale, 'Vente', ascending)).toBeGreaterThan(0);
      expect(comparePublicPrices(sale, mixed, 'Vente', ascending)).toBeLessThan(0);
      expect(comparePublicPrices(mixed, mixed, 'Vente', ascending)).toBe(0);
    }
  });

  it('renders the real card with a mixed badge and a clearly labeled rent, or conditions in sale mode', () => {
    const markup = renderToStaticMarkup(createElement(MiniCard, { property: mixed, href: '/biens/qa-mixed-001' }));
    expect(markup).toContain('Vente / Location');
    expect(markup).toContain('Loyer mensuel : 320 000 FCFA');
    expect(markup).not.toContain('À vendre');
    const sale = renderToStaticMarkup(createElement(MiniCard, { property: mixed, href: '/biens/qa-mixed-001', priceIntent: 'Vente' }));
    expect(sale).toContain('Vente / Location');
    expect(sale).toContain('Conditions sur demande');
    expect(sale).not.toContain('320 000');
  });

  it('keeps other transaction labels and supplies localized mixed prices and missing-price fallback', () => {
    expect(formatListingPrice(320_000, 'Vente & Location', 'en')).toBe('Monthly rent : 320 000 FCFA');
    expect(formatListingPrice(0, 'Vente & Location', 'en')).toBe('Terms on request');
    expect(formatListingPrice(40_000_000, 'Vente', 'fr')).toBe('40 000 000 FCFA');
    expect(formatListingPrice(320_000, 'Location', 'fr')).toBe('320 000 FCFA / mois');
    expect(propertySeoTitle(mixed, 'fr')).toContain('Loyer mensuel : 320 000 FCFA');
  });
});
