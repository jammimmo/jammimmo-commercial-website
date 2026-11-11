import { expect, it, vi } from 'vitest';
import { propertyFactAnswer } from './property-facts';

const fixture = vi.hoisted(() => ({
  capture: { url: 'https://jammimmo.com/biens/', capturedAt: '2026-11-10T00:00:00Z', sha256: 'a'.repeat(64), listingCount: 1 },
  row: { id: 'a0000000-0000-4000-8000-000000000001', reference: 'QA-MIXED-001', title: 'Villa fictive', type: 'Villa',
    transaction_type: 'Vente & Location', city: 'Dakar', quartier: 'Fictif', price: 320_000, surface: 100, bedrooms: 1,
    negotiable: false, description: '', url: 'https://jammimmo.com/biens/qa-mixed-001', features: {}, rentalPeriod: null },
}));
vi.mock('@catalogue-approval', () => ({ default: { schemaVersion: 1, source: 'trusted-production',
  capture: fixture.capture, catalogueSha256: 'b'.repeat(64), factsSha256: 'c'.repeat(64) } }));
vi.mock('@catalogue-facts', () => ({ default: { schemaVersion: 1, capture: fixture.capture, listings: [fixture.row] } }));

it('only presents the mixed public amount as rent and cannot cite it as the sale price', () => {
  const page = { path: '/biens/qa-mixed-001/', propertyReference: fixture.row.reference };
  const sale = propertyFactAnswer('Quel est le prix de vente ?', 'Quel est le prix de vente ?', page, 'fr', []);
  expect(sale?.content).toContain('Prix de vente : non renseigné');
  expect(sale?.content).not.toContain('320 000');
  expect(sale?.citations.every(source => !source.id.endsWith(':price'))).toBe(true);
  expect(sale?.handoffSuggested).toBe(true);

  const rental = propertyFactAnswer('Quel est le loyer ?', 'Quel est le loyer ?', page, 'fr', []);
  expect(rental?.content).toContain('Loyer mensuel publié : 320 000 FCFA / mois');
  expect(rental?.citations[0]?.quote).toBe('320 000 FCFA / mois');
});
