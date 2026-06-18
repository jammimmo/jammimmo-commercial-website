import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { filterPlaces, placeContext, MIN_QUERY_CHARS, type Place } from '@/lib/places';

/**
 * PlaceAutocomplete — sélecteur de commune/quartier partagé (Estimation, Budget,
 * Match-o-mètre). Remplace le `<datalist>` natif pour une raison concrète : sur
 * WebKit / iOS (notre cible prioritaire mobile) le libellé secondaire d'une
 * <option> de datalist n'est PAS affiché — donc la VILLE correspondante (commune
 * · région) restait invisible là où elle compte le plus, et n'était pas testable.
 *
 * Ce combobox maison affiche, pour chaque suggestion : le NOM du lieu + sa ville
 * de rattachement (« commune · région »). À la sélection on n'écrit que le nom
 * propre dans le champ (le matching biens et le message WhatsApp restent
 * inchangés). La saisie LIBRE reste acceptée à tout moment : un lead n'est jamais
 * bloqué si l'utilisateur tape un lieu hors catalogue.
 *
 * Standard site : aucune suggestion sous `MIN_QUERY_CHARS` (= 3) caractères.
 * Accessibilité : pattern ARIA combobox (role combobox/listbox/option,
 * aria-activedescendant), navigation clavier ↑/↓/Entrée/Échap.
 */
interface Props {
  /** id du <input> — conservé identique aux anciens (#est-quartier, #bud-zone, #match-zone). */
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

const INPUT_CLASS =
  'w-full h-11 px-3.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const MAX_SUGGESTIONS = 8;

export default function PlaceAutocomplete({ id, value, onChange, placeholder, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = `${id}-listbox`;

  const q = value.trim();
  const suggestions: Place[] =
    q.length >= MIN_QUERY_CHARS ? filterPlaces(q, MAX_SUGGESTIONS) : [];
  const showList = open && suggestions.length > 0;

  // Ferme la liste sur un clic/tap à l'extérieur (pointerdown = souris + tactile).
  useEffect(() => {
    function onDocDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDocDown);
    return () => document.removeEventListener('pointerdown', onDocDown);
  }, []);

  function choose(p: Place) {
    onChange(p.name); // n'écrit QUE le nom propre (matching/lead inchangés)
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList) {
      if (e.key === 'ArrowDown' && suggestions.length) {
        setOpen(true);
        setActive(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setActive((i) => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (active >= 0) {
        choose(suggestions[active]);
        e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        id={id}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-auto rounded-xl border border-input bg-card shadow-lg py-1"
        >
          {suggestions.map((p, i) => (
            <li
              key={`${p.name}|${p.commune}`}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              data-place-option
              // pointerdown (pas click) : la sélection gagne la course contre le
              // blur de l'input (sinon la liste se ferme avant le clic, surtout mobile).
              onPointerDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={
                'flex items-start gap-2 px-3 py-2 cursor-pointer ' +
                (i === active ? 'bg-accent' : '')
              }
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-secondary shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground truncate" data-place-name>
                  {p.name}
                </span>
                {/* La ville de rattachement : « commune · région » (ou la région
                    seule pour une commune). C'est le « corresponding city ». */}
                <span className="block text-xs text-muted-foreground truncate" data-place-city>
                  {placeContext(p)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
