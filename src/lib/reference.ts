/**
 * Reference helpers. The admin generates refs as VILLE-QUARTIER-YEAR-NNNNN
 * (e.g. DKR-MERM-2026-00019). We never display the full ref publicly — only
 * the trailing serial as "Ref #00019".
 *
 * Parsing logic ported from admin: src/lib/reference-generator.ts
 */

const REF_RE = /^([A-Z]{2,4})-([A-Z]{2,6})-(\d{4})-(\d{5})$/;

export interface ParsedRef {
  city: string;
  quartier: string;
  year: number;
  serial: string; // "00019"
}

export function parseInternalRef(ref: string): ParsedRef | null {
  const m = REF_RE.exec(ref);
  if (!m) return null;
  return {
    city: m[1]!,
    quartier: m[2]!,
    year: parseInt(m[3]!, 10),
    serial: m[4]!,
  };
}

export function isInternalRef(ref: string): boolean {
  return REF_RE.test(ref);
}

/** "Ref #00019" for public display, or "Ref #—" if unparseable. */
export function formatPublicRef(ref: string): string {
  const parsed = parseInternalRef(ref);
  if (!parsed) return 'Ref #—';
  return `Ref #${parsed.serial}`;
}

/** URL-safe slug for /biens/[slug]. We use the full internal ref because
 *  it's already URL-safe and uniquely identifies a property. */
export function refToSlug(ref: string): string {
  return ref.toLowerCase();
}

export function slugToRef(slug: string): string {
  return slug.toUpperCase();
}
