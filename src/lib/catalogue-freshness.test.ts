import { afterEach, describe, expect, it, vi } from 'vitest';
import original from '../data/public-catalogue-20261031.json';
import { validateCatalogue, validatePropertyFacts, validateCataloguePair } from './public-catalogue';
import { projectProductionCatalogue } from '../../scripts/catalogue-artifact.mjs';

const rows = () => validateCatalogue(original).properties.map(row => ({ ...row, is_public: true, deleted_at: null }));
function artifact(input: Array<Record<string, unknown>>) {
  return projectProductionCatalogue(input, [], '2026-11-01T13:07:00Z');
}
function select(fresh: ReturnType<typeof artifact>) {
  vi.doMock('@catalogue-public?raw', () => ({ default: fresh.catalogueText }));
  vi.doMock('@catalogue-facts', () => ({ default: JSON.parse(fresh.factsText) }));
  vi.doMock('@catalogue-approval', () => ({ default: JSON.parse(fresh.approvalText) }));
  vi.stubEnv('CATALOGUE_BUILD_SOURCE', 'prepared-production');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Renderer network forbidden'); }));
}
afterEach(() => { vi.doUnmock('@catalogue-public?raw'); vi.doUnmock('@catalogue-facts'); vi.doUnmock('@catalogue-approval'); vi.resetModules(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('one fresh public revision across the actual consumers', () => {
  it('preserves stored environment labels through the actual catalogue, detail and JSON readers', async () => {
    const input = rows();
    const nearby = [{ name: 'Pharmacie', distance: '200m' }, { name: 'École', distance: '5 min' }, { name: 'Marché', distance: '' }];
    input[0].nearby_commerce = nearby; select(artifact(input));
    const api = await import('./supabase.build'), json = await import('../pages/api/property/[ref].json');
    expect((await api.listPublicProperties()).find(row => row.id === input[0].id)?.nearby_commerce).toEqual(nearby);
    expect((await api.getPublicPropertyByRef(input[0].reference))?.nearby_commerce).toEqual(nearby);
    const response = await json.GET({ params: { ref: input[0].reference.toLowerCase() } } as never);
    expect((await response.json()).nearby_commerce).toEqual(nearby);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('makes the added98th discoverable through all four readers, static JSON paths and chatbot citations', async () => {
    const input = rows(); const added = { ...input[0], id: '12345678-1234-4234-8234-123456789098', reference: 'JI-NEW-00098', title: 'Fixture newly published property', price: 987654321 };
    input.push(added); select(artifact(input));
    const api = await import('./supabase.build'), facts = await import('./chat/property-facts'), json = await import('../pages/api/property/[ref].json');
    expect(await api.listPublicProperties()).toHaveLength(98);
    expect((await api.listAllPublicRefs()).map(row => row.reference)).toContain(added.reference);
    expect(await api.getPublicPropertyByRef(added.reference.toLowerCase())).toMatchObject({ id: added.id, price: added.price });
    expect((await api.findSimilar(input[0] as unknown as Parameters<typeof api.findSimilar>[0], 1000)).map(row => row.id)).toContain(added.id);
    expect((await json.getStaticPaths()).map(row => row.params.ref)).toContain(added.reference.toLowerCase());
    const response = await json.GET({ params: { ref: added.reference.toLowerCase() } } as never);
    expect(await response.json()).toMatchObject({ id: added.id, price: added.price });
    const answer = facts.propertyFactAnswer('Quel prix pour ' + added.reference, 'Quel prix pour ' + added.reference, { path: '/' }, 'fr', [])!;
    expect(answer.content).toContain('01/11/2026 à 13:07 UTC'); expect(answer.content).toContain('Catalogue public préparé'); expect(answer.content).toContain('987');
    expect(facts.propertyCitationFromId(answer.citations[0].id)).toEqual(answer.citations[0]);
    expect(facts.PUBLIC_PROPERTY_FACTS.map(row => row.id)).toEqual((await api.listAllPublicRefs()).map(ref => input.find(row => row.reference === ref.reference)!.id));
    expect(fetch).not.toHaveBeenCalled();
  });
  it('removes withdrawn rows and updates public prices across catalogue, JSON and facts', async () => {
    const input = rows(), removed = input.shift()!; input[0].price = 123456789; select(artifact(input));
    const api = await import('./supabase.build'), facts = await import('./chat/property-facts'), json = await import('../pages/api/property/[ref].json');
    expect(await api.getPublicPropertyByRef(removed.reference)).toBeNull(); expect((await json.getStaticPaths()).map(row => row.params.ref)).not.toContain(removed.reference.toLowerCase());
    expect((await api.getPublicPropertyByRef(input[0].reference))?.price).toBe(123456789);
    expect(facts.PUBLIC_PROPERTY_FACTS.find(row => row.id === input[0].id)?.price).toBe(123456789);
    expect(facts.PUBLIC_PROPERTY_FACTS.some(row => row.id === removed.id)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects a cross-revision or privately enriched facts corpus even when each file parses', () => {
    const fresh = artifact(rows()), catalogue = JSON.parse(fresh.catalogueText), facts = JSON.parse(fresh.factsText);
    facts.listings[0].price += 1;
    expect(() => validateCataloguePair(validateCatalogue(catalogue, catalogue.capture), validatePropertyFacts(facts, facts.capture))).toThrow('mismatch');
    const privatelyEnriched = JSON.parse(fresh.factsText); privatelyEnriched.listings[0].features.ownerMonth = 100;
    expect(() => validatePropertyFacts(privatelyEnriched, privatelyEnriched.capture)).toThrow('unprojected');
  });
  it('retains every public row past the former 200-row listing limit', async () => {
    const input = rows();
    while (input.length < 201) {
      const serial = String(input.length).padStart(12, '0');
      input.push({ ...input[0], id: '12345678-1234-4234-8234-' + serial, reference: 'JI-FIXTURE-' + serial });
    }
    select(artifact(input)); const api = await import('./supabase.build');
    expect(await api.listPublicProperties()).toHaveLength(201); expect(await api.listAllPublicRefs()).toHaveLength(201);
    expect(await api.getPublicPropertyByRef(input.at(-1)!.reference)).not.toBeNull();
  });
  it('reuses only approved unchanged extras and discloses their original capture date', async () => {
    const input = rows();
    const legacy = input.find(row => row.attributes.piscine === true && !row.commodities.includes('Piscine'))!;
    expect(legacy).toBeDefined();
    const fresh = projectProductionCatalogue(input, [], '2026-11-01T13:07:00Z', original);
    const facts = JSON.parse(fresh.factsText).listings;
    expect(facts.find((row: { id: string }) => row.id === legacy.id)).toMatchObject({ features: { piscine: true }, extrasCapturedAt: '2026-10-31T09:29:04Z' });
    select(fresh); const api = await import('./chat/property-facts');
    const answer = api.propertyFactAnswer('Piscine ' + legacy.reference, 'Piscine ' + legacy.reference, { path: '/' }, 'fr', [])!;
    expect(answer.content).toContain('capture publique du 31/10/2026'); expect(answer.content).toContain('n’ont pas été relues'); expect(answer.content).toContain('01/11/2026 à 13:07 UTC');
  });
  it('drops extras on changed/missing rows, changed public fields, or unequal full timestamps within the same millisecond', () => {
    const base = rows(); const index = base.findIndex(row => row.attributes.piscine === true && !row.commodities.includes('Piscine'));
    const legacy = base[index]; expect(legacy).toBeDefined();
    const shortened = legacy.updated_at.replace(/(\.\d{3})\d+/, '$1');
    expect(shortened).not.toBe(legacy.updated_at); expect(Date.parse(shortened)).toBe(Date.parse(legacy.updated_at));
    for (const change of [
      (row: typeof legacy) => { row.updated_at = shortened; },
      (row: typeof legacy) => { row.updated_at = '2026-11-01T13:06:00Z'; row.attributes = { piscine: false } as typeof row.attributes; },
      (row: typeof legacy) => { row.price += 1; },
      (row: typeof legacy) => { row.images = [...row.images, 'https://images.unsplash.com/fixture.jpg']; },
      (row: typeof legacy) => { row.reference += '-CHANGED'; },
    ]) {
      const input = structuredClone(base); change(input[index]);
      const fresh = projectProductionCatalogue(input, [], '2026-11-01T13:07:00Z', original);
      const fact = JSON.parse(fresh.factsText).listings.find((row: { id: string }) => row.id === legacy.id);
      expect(fact.features.piscine).toBeUndefined(); expect(fact.extrasCapturedAt).toBeNull();
    }
    const removed = base.filter(row => row.id !== legacy.id);
    expect(JSON.parse(projectProductionCatalogue(removed, [], '2026-11-01T13:07:00Z', original).factsText).listings.some((row: { id: string }) => row.id === legacy.id)).toBe(false);
    const incomplete = structuredClone(base); delete (incomplete[index] as Partial<typeof legacy>).description;
    expect(() => projectProductionCatalogue(incomplete, [], '2026-11-01T13:07:00Z', original)).toThrow('Incomplete');
  });
  it('maps only exact positive public commodities, without using tags or interpreting absence as false', () => {
    const input = rows(); input[0].commodities = ['Piscine', 'Climatisation', 'Parking public']; input[0].tags = ['Premium', 'Jardin'];
    input[1].commodities = []; input[1].tags = ['Piscine'];
    const fresh = projectProductionCatalogue(input, [], '2026-11-01T13:07:00Z');
    const facts = JSON.parse(fresh.factsText).listings;
    expect(facts[0].features).toEqual({ climatisation: true, piscine: true });
    expect(facts[1].features).toEqual({}); expect(facts[0].rentalPeriod).toBeNull();
  });
});
