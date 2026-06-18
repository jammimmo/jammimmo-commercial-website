import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MapPin } from 'lucide-react';
import { filterPlaces, placeCrumbs, MIN_QUERY_CHARS, type Place } from '@/lib/places';

/**
 * PlaceAutocomplete — sélecteur de commune/quartier partagé (Estimation, Budget,
 * Match-o-mètre, recherche /biens, recherche du hero). Remplace le `<datalist>`
 * natif : sur WebKit / iOS le libellé secondaire d'une <option> n'est PAS affiché,
 * donc le rattachement géographique restait invisible et intestable.
 *
 * Chaque suggestion montre un FIL D'ARIANE complet : du nom tapé jusqu'à la
 * ville/région (« Almadies › Ngor › Dakar »), le nom en gras. À la sélection on
 * n'écrit que le nom propre dans le champ (matching biens / message WhatsApp /
 * filtres URL inchangés). Saisie LIBRE toujours acceptée — un lead/filtre n'est
 * jamais bloqué si l'utilisateur tape un lieu hors catalogue.
 *
 * La liste est rendue dans un PORTAL (document.body, position: fixed) avec bascule
 * automatique vers le haut si peu de place : indispensable car certains parents
 * (le hero `overflow-hidden`, des barres `sticky`) rogneraient/masqueraient une
 * liste en `absolute`. z au-dessus du header.
 *
 * Standard site : aucune suggestion sous `MIN_QUERY_CHARS` (= 3) caractères.
 * Accessibilité : pattern ARIA combobox, navigation clavier ↑/↓/Entrée/Échap.
 */
interface Props {
  /** id du <input> — conservé identique aux anciens (#est-quartier, #bud-zone, #match-zone…). */
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Surcharge le style du <input> (défaut = style « champ d'outil »). */
  inputClassName?: string;
  /** Icône décorative à gauche dans le champ (le className doit alors prévoir le padding). */
  leading?: ReactNode;
}

const INPUT_CLASS =
  'w-full h-11 px-3.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const MAX_SUGGESTIONS = 8;

interface Pos {
  left: number;
  top: number;
  width: number;
  maxH: number;
  up: boolean;
}

export default function PlaceAutocomplete({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
  inputClassName,
  leading,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = `${id}-listbox`;

  const q = value.trim();
  const suggestions: Place[] =
    q.length >= MIN_QUERY_CHARS ? filterPlaces(q, MAX_SUGGESTIONS) : [];
  const showList = open && suggestions.length > 0;

  useEffect(() => setMounted(true), []);

  // Positionne la liste (portal, position: fixed) sous — ou au-dessus si peu de
  // place — le champ, et la garde alignée au scroll / resize tant qu'elle est ouverte.
  function reposition() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const up = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxH = Math.max(120, Math.min(264, (up ? spaceAbove : spaceBelow) - 8));
    setPos({ left: r.left, width: r.width, top: up ? r.top - gap : r.bottom + gap, maxH, up });
  }

  useEffect(() => {
    if (showList) reposition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showList, suggestions.length, value]);

  useEffect(() => {
    if (!showList) return;
    const h = () => reposition();
    window.addEventListener('scroll', h, true);
    window.addEventListener('resize', h);
    return () => {
      window.removeEventListener('scroll', h, true);
      window.removeEventListener('resize', h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showList]);

  // Ferme sur clic/tap hors du champ ET hors de la liste (qui vit dans le portal).
  useEffect(() => {
    function onDocDown(e: PointerEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onDocDown);
    return () => document.removeEventListener('pointerdown', onDocDown);
  }, []);

  function choose(p: Place) {
    onChange(p.name); // n'écrit QUE le nom propre (matching/lead/filtre inchangés)
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
      {leading != null && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
          {leading}
        </span>
      )}
      <input
        ref={inputRef}
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
        className={inputClassName ?? INPUT_CLASS}
      />
      {mounted &&
        showList &&
        pos &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              width: pos.width,
              maxHeight: pos.maxH,
              transform: pos.up ? 'translateY(-100%)' : undefined,
            }}
            className="z-[60] overflow-auto rounded-xl border border-input bg-card shadow-lg py-1 text-left"
          >
            {suggestions.map((p, i) => {
              const crumbs = placeCrumbs(p);
              return (
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
                  <MapPin
                    className="w-3.5 h-3.5 mt-0.5 text-secondary shrink-0"
                    aria-hidden="true"
                  />
                  {/* Fil d'Ariane : nom (gras) › commune › région — le rattachement
                      complet, « du nom tapé jusqu'à la ville ». */}
                  <span className="text-sm leading-snug">
                    <span className="font-medium text-foreground" data-place-name>
                      {crumbs[0]}
                    </span>
                    {crumbs.length > 1 && (
                      <span className="text-muted-foreground" data-place-trail>
                        {crumbs.slice(1).map((c, j) => (
                          <span key={j}>
                            <span className="px-1 opacity-60" aria-hidden="true">
                              ›
                            </span>
                            {c}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
