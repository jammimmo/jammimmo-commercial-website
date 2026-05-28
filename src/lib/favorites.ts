/**
 * Favoris — pure-client state in `localStorage`. Pas de notion de compte
 * sur la vitrine, donc la liste vit uniquement sur l'appareil de l'utilisateur.
 *
 * Mirror du module `compare.ts` (même contrat, même event-bus pattern) pour
 * garder une seule façon d'écrire ces flags côté UI.
 */

export const FAVORITES_KEY = 'jammimmo:favorites';
/** Plafond raisonnable pour ne pas exploser le localStorage (5 MB → ~5000 entrées). */
export const MAX_FAVORITES = 200;

export interface FavoriteEntry {
  reference: string;
  title: string;
  /** ISO timestamp d'ajout, utilisé pour le tri sur la page /favoris. */
  addedAt: string;
}

export function readFavorites(): FavoriteEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is FavoriteEntry =>
        x &&
        typeof x.reference === 'string' &&
        typeof x.title === 'string' &&
        typeof x.addedAt === 'string',
    );
  } catch {
    return [];
  }
}

export function writeFavorites(list: FavoriteEntry[]): void {
  if (typeof window === 'undefined') return;
  const sliced = list.slice(0, MAX_FAVORITES);
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(sliced));
  window.dispatchEvent(new CustomEvent(`${FAVORITES_KEY}:update`));
}

export function clearFavorites(): void {
  writeFavorites([]);
}
