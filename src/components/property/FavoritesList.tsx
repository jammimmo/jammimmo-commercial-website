import { useEffect, useState } from 'react';
import { Loader2, HeartCrack, ArrowRight } from 'lucide-react';
import { t, type Lang, localizedPath } from '@/lib/i18n';
import { FAVORITES_KEY, readFavorites, clearFavorites } from '@/lib/favorites';
import type { PublicProperty } from '@/types/property';
import MiniCard from './MiniCard';
import RecallCta from './RecallCta';

interface Props {
  lang: Lang;
}

/**
 * Liste des biens favoris — lit `jammimmo:favorites` du localStorage, fetch
 * chaque bien via le snapshot statique `/api/property/<ref>.json`, et
 * affiche une grille de `MiniCard` (le heart est déjà dedans, donc l'utilisateur
 * peut retirer un favori sans quitter la page).
 *
 * Pattern repris de `CompareTable.tsx` — même logique de stale-refs (un bien
 * a pu être dépublié/supprimé côté admin et son JSON renvoie 404).
 */
export default function FavoritesList({ lang }: Props) {
  const [refs, setRefs] = useState<Array<{ reference: string; addedAt: string }>>([]);
  const [data, setData] = useState<PublicProperty[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to the localStorage event bus so the list updates immediately
  // when the user clicks a heart inside any MiniCard.
  useEffect(() => {
    const sync = () => {
      const entries = readFavorites();
      setRefs(entries.map((e) => ({ reference: e.reference, addedAt: e.addedAt })));
    };
    sync();
    window.addEventListener(`${FAVORITES_KEY}:update`, sync);
    return () => window.removeEventListener(`${FAVORITES_KEY}:update`, sync);
  }, []);

  useEffect(() => {
    if (refs.length === 0) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      refs.map((r) =>
        fetch(`/api/property/${encodeURIComponent(r.reference.trim().toLowerCase())}.json`).then(
          (res) => (res.ok ? res.json() : null),
        ),
      ),
    )
      .then((list) => {
        // Garde-fou : on filtre les 404 (biens dépubliés), et on trie par date
        // d'ajout décroissante pour que le dernier favori soit en haut.
        const fetched = list.filter((p): p is PublicProperty => p !== null);
        const orderByRef = new Map(refs.map((r, i) => [r.reference, i]));
        fetched.sort(
          (a, b) => (orderByRef.get(a.reference) ?? 0) - (orderByRef.get(b.reference) ?? 0),
        );
        setData(fetched);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [refs.map((r) => r.reference).join(',')]);

  if (loading) {
    return (
      <div className="grid place-items-center py-20 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-16 sm:py-20 bg-card border border-clay rounded-3xl px-6">
        <HeartCrack className="w-10 h-10 mx-auto mb-4 text-muted-foreground/70" />
        <p className="font-serif text-2xl mb-2">{t('page.favorites.empty.title', lang)}</p>
        <p className="text-muted-foreground max-w-md mx-auto mb-6">
          {t('page.favorites.empty.body', lang)}
        </p>
        <a
          href={localizedPath('/biens', lang)}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold shadow hover:translate-y-[-1px] transition"
        >
          {t('page.favorites.empty.cta', lang)}
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-baseline justify-between mb-6 sm:mb-8">
        <p className="text-muted-foreground text-sm">
          {t('page.favorites.count', lang).replace('{count}', String(data.length))}
        </p>
        <button
          type="button"
          onClick={() => {
            if (confirm(t('page.favorites.clearConfirm', lang))) {
              clearFavorites();
            }
          }}
          className="text-[13px] font-semibold text-terra hover:underline"
        >
          {t('page.favorites.clear', lang)}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
        {data.map((p) => (
          <MiniCard
            key={p.reference}
            property={p}
            href={localizedPath(`/biens/${p.reference.toLowerCase()}`, lang)}
            lang={lang}
          />
        ))}
      </div>
      <RecallCta
        lang={lang}
        keyPrefix="page.favorites.recall"
        items={data.map((p) => ({ reference: p.reference, title: p.title }))}
      />
    </>
  );
}
