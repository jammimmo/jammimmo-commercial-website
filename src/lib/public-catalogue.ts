/** Public, versioned capture contract. No DB, filesystem, model or network. */
import type { PublicProperty } from '../types/property';
import { approximatePropertyCenter, PREPARED_PUBLIC_ZONE_RADIUS_M } from './public-geo.ts';

export const CAPTURE_SHA256 = '700e106adaf9d1cbcd466c551bda83d4873cfd045809678bf9c4579e74ce6f38';
export const CAPTURED_AT = '2026-10-31T09:29:04Z';
export const CAPTURE_COUNT = 97;
export const PROPERTY_REVISION = CAPTURE_SHA256.slice(0, 12);
export const MAX_CATALOGUE_PROPERTIES = 1000;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
export const FEATURE_KEYS = ['toilettes', 'salles_de_bain', 'etage', 'niveaux', 'salons', 'cuisine', 'parking', 'jardin', 'piscine', 'terrasse', 'balcon', 'ascenseur', 'climatisation'];
type Scalar = string | number | boolean | null;
export interface PublicCapture { url: string; capturedAt: string; sha256: string; listingCount: number }
export interface CatalogueApproval {
  schemaVersion: 1; source: 'public-snapshot-20261031' | 'trusted-production';
  capture: PublicCapture; catalogueSha256: string; factsSha256: string;
}
export const APPROVED_CAPTURE: PublicCapture = Object.freeze({ url: 'https://jammimmo.com/biens/', capturedAt: CAPTURED_AT, sha256: CAPTURE_SHA256, listingCount: CAPTURE_COUNT });
export interface PublicCatalogue { schemaVersion: 1; capture: PublicCapture; properties: PublicProperty[]; hrefByRef: Record<string, string> }
export interface PropertyFact {
  id: string; reference: string; title: string; type: string; transaction_type: string;
  city: string; quartier: string; price: number; surface: number; bedrooms: number;
  negotiable: boolean; description: string; url: string; features: Record<string, Scalar>;
  rentalPeriod: 'month' | 'night' | 'week' | null;
  /** Optional provenance of unchanged extras from the approved historical capture. */
  extrasCapturedAt?: string | null;
}
export interface PropertyFactCorpus { schemaVersion: 1; capture: PublicCapture; listings: PropertyFact[] }
function check(value: unknown, message: string): asserts value { if (!value) throw new Error('[public-catalogue] ' + message); }
function object(value: unknown): asserts value is Record<string, unknown> {
  check(!!value && typeof value === 'object' && !Array.isArray(value), 'expected object');
  check(Object.keys(value).every(key => !['__proto__', 'prototype', 'constructor'].includes(key)), 'unsafe key');
}
function keys(value: Record<string, unknown>, expected: string[]) {
  check(Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)), 'unexpected/missing fields');
}
function text(value: unknown, max: number, required = false): asserts value is string {
  check(typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0) && !CONTROLS.test(value), 'invalid text');
}
function number(value: unknown, max: number): asserts value is number {
  check(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max, 'invalid number');
}
function iso(value: unknown, nullable = false) {
  if (value === null && nullable) return;
  text(value, 50, true);
  check(/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)), 'invalid dated field');
}
export function safePropertyReference(value: string): boolean {
  return value.length >= 1 && value.length <= 100 && !/[/\\?#%\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value) && !['.', '..'].includes(value);
}
export function propertyCanonicalUrl(reference: string): string {
  check(safePropertyReference(reference), 'unsafe reference');
  const segment = encodeURIComponent(reference.toLowerCase()).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
  return 'https://jammimmo.com/biens/' + segment;
}
function features(value: unknown) {
  object(value);
  check(Object.keys(value).every(key => FEATURE_KEYS.includes(key)), 'unprojected feature');
  for (const item of Object.values(value)) {
    if (typeof item === 'string') text(item, 200);
    else if (typeof item === 'number') number(item, 1_000_000);
    else check(item === null || typeof item === 'boolean', 'non-scalar feature');
  }
}
function core(row: Record<string, unknown>) {
  text(row.id, 36); check(UUID.test(row.id), 'invalid id');
  text(row.reference, 100, true); check(safePropertyReference(row.reference), 'unsafe reference');
  for (const key of ['title', 'type', 'city', 'quartier']) text(row[key], key === 'title' ? 200 : 100, key === 'title' || key === 'type');
  check(['Vente', 'Location', 'Vente & Location'].includes(String(row.transaction_type)), 'invalid transaction');
  number(row.price, 1_000_000_000_000); number(row.surface, 1_000_000_000); number(row.bedrooms, 1000);
  check(typeof row.negotiable === 'boolean', 'invalid negotiable'); text(row.description, 12000);
}
function capture(value: unknown, expected: PublicCapture) {
  object(value); keys(value, ['url', 'capturedAt', 'sha256', 'listingCount']);
  check(expected.url === 'https://jammimmo.com/biens/' && /^[a-f0-9]{64}$/.test(expected.sha256), 'invalid capture approval');
  iso(expected.capturedAt); number(expected.listingCount, MAX_CATALOGUE_PROPERTIES); check(Number.isInteger(expected.listingCount), 'invalid capture count');
  check(value.url === expected.url && value.capturedAt === expected.capturedAt && value.sha256 === expected.sha256 && value.listingCount === expected.listingCount, 'unapproved capture');
}
function unique(rows: Array<Record<string, unknown>>) {
  check(new Set(rows.map(row => row.id)).size === rows.length, 'duplicate id');
  check(new Set(rows.map(row => String(row.reference).toLowerCase())).size === rows.length, 'ambiguous reference');
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); }
  return value;
}
export function validateCatalogueApproval(value: unknown): CatalogueApproval {
  object(value); keys(value, ['schemaVersion', 'source', 'capture', 'catalogueSha256', 'factsSha256']);
  check(value.schemaVersion === 1 && ['public-snapshot-20261031', 'trusted-production'].includes(String(value.source)), 'invalid approval source');
  object(value.capture);
  capture(value.capture, value.source === 'public-snapshot-20261031' ? APPROVED_CAPTURE : value.capture as unknown as PublicCapture);
  for (const key of ['catalogueSha256', 'factsSha256']) check(typeof value[key] === 'string' && /^[a-f0-9]{64}$/.test(value[key] as string), 'invalid approval hash');
  return deepFreeze(value as unknown as CatalogueApproval);
}
export function validateCatalogue(value: unknown, expected: PublicCapture = APPROVED_CAPTURE): PublicCatalogue {
  object(value); keys(value, ['schemaVersion', 'capture', 'properties', 'hrefByRef']);
  check(value.schemaVersion === 1, 'invalid version'); capture(value.capture, expected);
  check(Array.isArray(value.properties) && value.properties.length === expected.listingCount, 'incomplete catalogue');
  object(value.hrefByRef); check(Object.keys(value.hrefByRef).length === expected.listingCount, 'href count mismatch');
  for (const row of value.properties) {
    object(row); keys(row, ['id', 'reference', 'title', 'type', 'transaction_type', 'status', 'city', 'quartier', 'address', 'geo', 'price', 'negotiable', 'commercial_message', 'surface', 'bedrooms', 'images', 'video_links', 'attributes', 'commodities', 'nearby_commerce', 'documents', 'flux_passage', 'tags', 'description', 'published_at', 'updated_at']);
    core(row); check(row.status === 'Disponible', 'unexpected publication status');
    if (row.address !== null) text(row.address, 500);
    text(row.commercial_message, 4000); features(row.attributes);
    object(row.documents); check(Object.keys(row.documents).length === 0, 'unreviewed document');
    check(row.flux_passage === null || ['F1', 'F2', 'F3', 'F4', 'F5'].includes(String(row.flux_passage)), 'invalid foot traffic');
    iso(row.published_at, true); iso(row.updated_at);
    for (const key of ['commodities', 'tags']) { const list = row[key]; check(Array.isArray(list) && list.length <= 100, 'invalid text array'); for (const item of list) text(item, 200); }
    check(Array.isArray(row.nearby_commerce) && row.nearby_commerce.length <= 100, 'invalid environment');
    for (const item of row.nearby_commerce) { object(item); keys(item, ['name', 'distance']); text(item.name, 200); check(['100m', '500m', '1km'].includes(String(item.distance)), 'invalid distance'); }
    for (const key of ['images', 'video_links']) {
      const list = row[key]; check(Array.isArray(list) && list.length <= (key === 'images' ? 100 : 30), 'invalid media array');
      const hosts = key === 'images' ? ['pub-15cb63d8148e4d51807e901562b85914.r2.dev', 'images.unsplash.com'] : ['www.youtube.com', 'youtube.com', 'youtu.be'];
      for (const item of list) { text(item, 2000); const url = new URL(item); check(url.protocol === 'https:' && hosts.includes(url.hostname) && !url.username && !url.password && !url.port, 'unapproved media URL'); }
    }
    if (row.geo !== null) {
      object(row.geo); keys(row.geo, ['centerLat', 'centerLng', 'radiusM']);
      check(typeof row.geo.centerLat === 'number' && Number.isFinite(row.geo.centerLat) && Math.abs(row.geo.centerLat) <= 90, 'invalid zone latitude');
      check(typeof row.geo.centerLng === 'number' && Number.isFinite(row.geo.centerLng) && Math.abs(row.geo.centerLng) <= 180, 'invalid public zone');
      if (expected.sha256 === CAPTURE_SHA256) check(row.geo.radiusM === 500, 'invalid captured zone');
      else {
        const center = approximatePropertyCenter(row.geo.centerLat, row.geo.centerLng);
        check(center && center.lat === row.geo.centerLat && center.lng === row.geo.centerLng && row.geo.radiusM === PREPARED_PUBLIC_ZONE_RADIUS_M, 'unprojected precise public zone');
      }
    }
    check(value.hrefByRef[String(row.reference)] === propertyCanonicalUrl(String(row.reference)), 'href/reference mismatch');
  }
  unique(value.properties);
  return deepFreeze(value as unknown as PublicCatalogue);
}
export function validatePropertyFacts(value: unknown, expected: PublicCapture = APPROVED_CAPTURE): PropertyFactCorpus {
  object(value); keys(value, ['schemaVersion', 'capture', 'listings']); check(value.schemaVersion === 1, 'invalid facts version'); capture(value.capture, expected);
  check(Array.isArray(value.listings) && value.listings.length === expected.listingCount, 'incomplete facts');
  for (const row of value.listings) {
    object(row); keys(row, ['id', 'reference', 'title', 'type', 'transaction_type', 'city', 'quartier', 'price', 'surface', 'bedrooms', 'negotiable', 'description', 'url', 'features', 'rentalPeriod', ...(Object.hasOwn(row, 'extrasCapturedAt') ? ['extrasCapturedAt'] : [])]);
    core(row); features(row.features); check(row.url === propertyCanonicalUrl(String(row.reference)), 'unapproved fact URL');
    check(row.rentalPeriod === null || (row.transaction_type === 'Location' && ['month', 'night', 'week'].includes(String(row.rentalPeriod))), 'invalid rental period');
    if (Object.hasOwn(row, 'extrasCapturedAt')) check(row.extrasCapturedAt === null || row.extrasCapturedAt === CAPTURED_AT, 'unapproved extras provenance');
  }
  unique(value.listings);
  return deepFreeze(value as unknown as PropertyFactCorpus);
}

/** Both consumers must describe precisely the same public revision. */
export function validateCataloguePair(catalogue: PublicCatalogue, facts: PropertyFactCorpus): void {
  check(JSON.stringify(catalogue.capture) === JSON.stringify(facts.capture), 'mixed catalogue revisions');
  check(catalogue.properties.length === facts.listings.length, 'mixed catalogue counts');
  for (let i = 0; i < catalogue.properties.length; i++) {
    const row = catalogue.properties[i], fact = facts.listings[i];
    for (const key of ['id', 'reference', 'title', 'type', 'transaction_type', 'city', 'quartier', 'price', 'surface', 'bedrooms', 'negotiable', 'description'] as const) check(row[key] === fact[key], 'catalogue/facts mismatch');
    check(JSON.stringify(row.attributes) === JSON.stringify(fact.features) && catalogue.hrefByRef[row.reference] === fact.url, 'catalogue/facts mismatch');
  }
}
