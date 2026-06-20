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

/**
 * "Ref #00019" for public display. Robust to ref-scheme changes: the admin now
 * emits refs like `JI-RCH-DKR-2606-0304` (5 segments) which the strict legacy
 * regex rejects — that made every fiche show a useless "Ref #—" while the real
 * ref was printed on the photo. So: try the legacy parse, else use the trailing
 * numeric block as the serial, else show the ref as-is. NEVER returns "#—" for a
 * non-empty ref; returns '' when there's no ref (so callers can hide the chip).
 */
export function formatPublicRef(ref: string | null | undefined): string {
  if (!ref) return '';
  const parsed = parseInternalRef(ref);
  if (parsed) return `Ref #${parsed.serial}`;
  const trailing = ref.match(/(\d+)\s*$/);
  if (trailing) return `Ref #${trailing[1]}`;
  return `Ref ${ref}`;
}

/** URL-safe slug for /biens/[slug]. We use the full internal ref because
 *  it's already URL-safe and uniquely identifies a property. */
export function refToSlug(ref: string): string {
  return ref.toLowerCase();
}

export function slugToRef(slug: string): string {
  return slug.toUpperCase();
}
