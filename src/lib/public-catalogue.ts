/** Public, versioned capture contract. No DB, filesystem, model or network. */
import type { PublicProperty } from '../types/property';

export const CAPTURE_SHA256 = '700e106adaf9d1cbcd466c551bda83d4873cfd045809678bf9c4579e74ce6f38';
export const CAPTURED_AT = '2026-10-31T09:29:04Z';
export const CAPTURE_COUNT = 97;
export const PROPERTY_REVISION = CAPTURE_SHA256.slice(0, 12);
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const FEATURE_KEYS = ['toilettes', 'salles_de_bain', 'etage', 'niveaux', 'salons', 'cuisine', 'parking', 'jardin', 'piscine', 'terrasse', 'balcon', 'ascenseur', 'climatisation'];
type Scalar = string | number | boolean | null;
export interface PublicCapture { url: string; capturedAt: string; sha256: string; listingCount: number }
export interface PublicCatalogue { schemaVersion: 1; capture: PublicCapture; properties: PublicProperty[]; hrefByRef: Record<string, string> }
export interface PropertyFact {
  id: string; reference: string; title: string; type: string; transaction_type: string;
  city: string; quartier: string; price: number; surface: number; bedrooms: number;
  negotiable: boolean; description: string; url: string; features: Record<string, Scalar>;
  rentalPeriod: 'month' | 'night' | 'week' | null;
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
function capture(value: unknown) {
  object(value); keys(value, ['url', 'capturedAt', 'sha256', 'listingCount']);
  check(value.url === 'https://jammimmo.com/biens/' && value.capturedAt === CAPTURED_AT && value.sha256 === CAPTURE_SHA256 && value.listingCount === CAPTURE_COUNT, 'unapproved capture');
}
function unique(rows: Array<Record<string, unknown>>) {
  check(new Set(rows.map(row => row.id)).size === CAPTURE_COUNT, 'duplicate id');
  check(new Set(rows.map(row => String(row.reference).toLowerCase())).size === CAPTURE_COUNT, 'ambiguous reference');
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); }
  return value;
}
export function validateCatalogue(value: unknown): PublicCatalogue {
  object(value); keys(value, ['schemaVersion', 'capture', 'properties', 'hrefByRef']);
  check(value.schemaVersion === 1, 'invalid version'); capture(value.capture);
  check(Array.isArray(value.properties) && value.properties.length === CAPTURE_COUNT, 'incomplete catalogue');
  object(value.hrefByRef); check(Object.keys(value.hrefByRef).length === CAPTURE_COUNT, 'href count mismatch');
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
      check(typeof row.geo.centerLng === 'number' && Number.isFinite(row.geo.centerLng) && Math.abs(row.geo.centerLng) <= 180 && row.geo.radiusM === 500, 'invalid public zone');
    }
    check(value.hrefByRef[String(row.reference)] === propertyCanonicalUrl(String(row.reference)), 'href/reference mismatch');
  }
  unique(value.properties);
  return deepFreeze(value as unknown as PublicCatalogue);
}
export function validatePropertyFacts(value: unknown): PropertyFactCorpus {
  object(value); keys(value, ['schemaVersion', 'capture', 'listings']); check(value.schemaVersion === 1, 'invalid facts version'); capture(value.capture);
  check(Array.isArray(value.listings) && value.listings.length === CAPTURE_COUNT, 'incomplete facts');
  for (const row of value.listings) {
    object(row); keys(row, ['id', 'reference', 'title', 'type', 'transaction_type', 'city', 'quartier', 'price', 'surface', 'bedrooms', 'negotiable', 'description', 'url', 'features', 'rentalPeriod']);
    core(row); features(row.features); check(row.url === propertyCanonicalUrl(String(row.reference)), 'unapproved fact URL');
    check(row.rentalPeriod === null || (row.transaction_type === 'Location' && ['month', 'night', 'week'].includes(String(row.rentalPeriod))), 'invalid rental period');
  }
  unique(value.listings);
  return deepFreeze(value as unknown as PropertyFactCorpus);
}
