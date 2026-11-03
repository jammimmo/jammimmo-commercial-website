import type { PublicProperty } from '../../src/types/property';

// Finite build data port. Never imports a client, catalogue snapshot or provider.
// Visible FICTIF labels keep these three listings distinguishable from real ads.
export async function listPublicProperties(_filters?: unknown): Promise<PublicProperty[]> {
  return [1, 2, 3].map((index): PublicProperty => ({
    id: `fa000000-0000-4000-8000-00000000000${index}`, reference: `QA-FICTIF-00${index}`,
    title: `Appartement FICTIF de recette ${index}`, type: 'Appartement', transaction_type: 'Vente',
    status: 'Disponible', city: 'Ville fictive', quartier: `Quartier fictif ${index}`, address: null, geo: null,
    price: 40_000_000 + index * 1_000_000, negotiable: false, commercial_message: '', surface: 80 + index,
    bedrooms: 2, images: ['/qa-property.svg'], video_links: [], attributes: {}, commodities: [], nearby_commerce: [],
    documents: {}, flux_passage: null, tags: [], description: 'Donnée entièrement fictive pour recette locale.',
    published_at: '2026-01-01T00:00:00Z', updated_at: `2026-01-0${index}T00:00:00Z`,
  }));
}
