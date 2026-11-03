import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import raw from '../data/public-catalogue-20261031.json?raw';
import rawFacts from '../data/public-property-facts-20261031.json';
import manifest from '../data/public-catalogue-20261031.manifest.json';
import { propertyCanonicalUrl, validateCatalogue, validatePropertyFacts } from './public-catalogue';

const client = vi.hoisted(() => vi.fn(() => { throw new Error('Supabase must not be initialized'); }));
vi.mock('@supabase/supabase-js', () => ({ createClient: client }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });
function snapshotMode(hash = manifest.outputs['public-catalogue-20261031.json'].sha256) {
  vi.stubEnv('CATALOGUE_BUILD_SOURCE', 'public-snapshot-20261031'); vi.stubEnv('CATALOGUE_SNAPSHOT_SHA256', hash);
  // Present credentials must never accidentally take precedence over snapshot.
  vi.stubEnv('ADMIN_SUPABASE_URL', 'https://must-not-be-contacted.example'); vi.stubEnv('ADMIN_SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  const network = vi.fn(() => { throw new Error('Network forbidden'); }); vi.stubGlobal('fetch', network); return network;
}
describe('approved immutable public catalogue', () => {
  it('matches the reviewed manifest and retains all references without private bags', () => {
    expect(createHash('sha256').update(raw).digest('hex')).toBe(manifest.outputs['public-catalogue-20261031.json'].sha256);
    const snapshot = validateCatalogue(JSON.parse(raw)), facts = validatePropertyFacts(rawFacts);
    expect(snapshot.properties).toHaveLength(97); expect(facts.listings).toHaveLength(97);
    expect(new Set(snapshot.properties.map(row => row.reference.toLowerCase())).size).toBe(97);
    for (const row of snapshot.properties) {
      expect(snapshot.hrefByRef[row.reference]).toBe(propertyCanonicalUrl(row.reference));
      expect(row.documents).toEqual({}); expect(row.attributes).not.toHaveProperty('tour'); expect(row.attributes).not.toHaveProperty('meuble_commission');
    }
    expect(Object.isFrozen(snapshot.properties[0].attributes)).toBe(true);
    expect(facts.listings.every(row => !('address' in row) && !('geo' in row) && !('status' in row))).toBe(true);
  });
  it('rejects omission, unprojected metadata, tampered links and stale provenance', () => {
    for (const mutate of [
      (data: any) => data.properties.pop(), (data: any) => { data.properties[0].attributes.ownerMonth = 1; },
      (data: any) => { data.hrefByRef[data.properties[0].reference] = 'https://evil.example/'; },
      (data: any) => { data.capture.capturedAt = '2026-11-01T00:00:00Z'; },
    ]) { const data = JSON.parse(raw); mutate(data); expect(() => validateCatalogue(data)).toThrow(); }
  });
  it('serves all four build APIs with real credentials present and zero network/client calls', async () => {
    const network = snapshotMode(); const api = await import('./supabase.build');
    const rows = await api.listPublicProperties(); expect(rows).toHaveLength(97);
    const refs = await api.listAllPublicRefs(); expect(refs).toHaveLength(97);
    // Real getStaticPaths→slugToRef round-trip, including the historical mixed-case emoji reference.
    for (const ref of refs) expect((await api.getPublicPropertyByRef(ref.reference.toLowerCase().toUpperCase()))?.reference).toBe(ref.reference);
    expect(await api.getPublicPropertyByRef('UNKNOWN-0000')).toBeNull();
    const matches = await api.listPublicProperties({ type: 'Villa', transaction: 'Vente', priceMin: 1, priceMax: 500_000_000, limit: 4 });
    expect(matches.length).toBeLessThanOrEqual(4); expect(matches.every(row => row.type === 'Villa' && row.transaction_type === 'Vente' && row.price > 0 && row.price <= 500_000_000)).toBe(true);
    const similar = await api.findSimilar(rows[0], 3); expect(similar.every(row => row.id !== rows[0].id && row.type === rows[0].type && row.city === rows[0].city)).toBe(true);
    rows[0].title = 'Caller mutation'; expect((await api.getPublicPropertyByRef(rows[0].reference))?.title).not.toBe('Caller mutation');
    expect(client).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  });
  it('fails hard for a missing/wrong hash or unknown mode, never falling back to the DB', async () => {
    snapshotMode('0'.repeat(64)); await expect(import('./supabase.build')).rejects.toThrow('hash');
    vi.resetModules(); vi.stubEnv('CATALOGUE_SNAPSHOT_SHA256', ''); await expect(import('./supabase.build')).rejects.toThrow('hash');
    vi.resetModules(); vi.stubEnv('CATALOGUE_BUILD_SOURCE', 'typo'); await expect(import('./supabase.build')).rejects.toThrow('CATALOGUE_BUILD_SOURCE');
    expect(client).not.toHaveBeenCalled();
  });
});
