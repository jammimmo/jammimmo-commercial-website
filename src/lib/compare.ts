/**
 * Comparateur de biens — state localStorage uniquement (pas de notion de
 * compte sur la vitrine, conformément à la décision V1). Persisté entre les
 * pages via `localStorage`, synchronisé entre toggles via un event custom.
 */

export const COMPARE_KEY = 'jammimmo:compare';
export const MAX_COMPARE = 3;

export interface CompareEntry {
  reference: string;
  title: string;
}

export function readCompare(): CompareEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(COMPARE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is CompareEntry => x && typeof x.reference === 'string' && typeof x.title === 'string',
    );
  } catch {
    return [];
  }
}

export function writeCompare(list: CompareEntry[]): void {
  if (typeof window === 'undefined') return;
  const sliced = list.slice(0, MAX_COMPARE);
  window.localStorage.setItem(COMPARE_KEY, JSON.stringify(sliced));
  window.dispatchEvent(new CustomEvent(`${COMPARE_KEY}:update`));
}

export function clearCompare(): void {
  writeCompare([]);
}
