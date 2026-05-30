import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { t, type Lang } from '@/lib/i18n';
import { FAVORITES_KEY, readFavorites, writeFavorites } from '@/lib/favorites';
import { track } from '@/lib/analytics';

interface Props {
  reference: string;
  title: string;
  lang: Lang;
  /**
   * `pill` = la même variante texte+icône que `CompareToggle` (à côté des actions).
   * `icon` = bouton rond cœur seul, posé en absolute sur la carte (overlay thumbnail).
   */
  variant?: 'pill' | 'icon';
}

/**
 * Toggle cœur "favoris" — stocke localement uniquement, sans compte. Synchronise
 * son état entre instances ouvertes via un CustomEvent (même pattern que
 * `CompareToggle`).
 *
 * `stopPropagation` est crucial sur la variante `icon` parce que la carte
 * tout entière est cliquable (lien vers la fiche bien).
 */
export default function FavoriteToggle({ reference, title, lang, variant = 'pill' }: Props) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(readFavorites().some((p) => p.reference === reference));
    const onUpdate = () =>
      setActive(readFavorites().some((p) => p.reference === reference));
    window.addEventListener(`${FAVORITES_KEY}:update`, onUpdate);
    return () => window.removeEventListener(`${FAVORITES_KEY}:update`, onUpdate);
  }, [reference]);

  function toggle(e: React.MouseEvent) {
    // L'icône est posée sur une carte cliquable — il faut tuer la propagation
    // pour ne pas suivre le lien parent quand on clique le cœur.
    e.preventDefault();
    e.stopPropagation();
    const list = readFavorites();
    if (active) {
      writeFavorites(list.filter((p) => p.reference !== reference));
      track({ name: 'favorite.removed', props: { ref: reference } });
    } else {
      writeFavorites([...list, { reference, title, addedAt: new Date().toISOString() }]);
      track({ name: 'favorite.added', props: { ref: reference } });
    }
  }

  const label = active
    ? t('property.favorite.remove', lang)
    : t('property.favorite.add', lang);

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={active}
        aria-label={label}
        title={label}
        className={
          'absolute top-2.5 right-2.5 z-10 grid place-items-center w-11 h-11 rounded-full shadow-md backdrop-blur-sm transition ' +
          (active
            ? 'bg-terra/95 text-white'
            : 'bg-white/90 text-foreground hover:bg-white')
        }
      >
        <Heart
          className="w-4 h-4 transition-transform"
          fill={active ? 'currentColor' : 'none'}
          strokeWidth={2}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      className={
        'mt-2 inline-flex items-center justify-center gap-1.5 self-start px-3 py-1.5 rounded-full text-[12px] font-semibold transition ' +
        (active
          ? 'bg-terra text-white'
          : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground')
      }
    >
      <Heart
        className="w-3.5 h-3.5"
        fill={active ? 'currentColor' : 'none'}
        strokeWidth={2}
      />
      {label}
    </button>
  );
}
