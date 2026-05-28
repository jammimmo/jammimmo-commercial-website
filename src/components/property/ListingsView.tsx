import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, SlidersHorizontal, X, Map as MapIcon, List as ListIcon } from 'lucide-react';
import type { PublicProperty } from '@/types/property';
import MiniCard from './MiniCard';
import ListingsMap from './ListingsMap';

interface Props {
  properties: PublicProperty[];
  cities: string[];
  /** Resolved /biens/<ref> path for each property reference (case+lang correct). */
  hrefByRef: Record<string, string>;
  lang: 'fr' | 'en' | 'wo';
}

type Filters = {
  q: string;
  type: string;
  transaction: string;
  city: string;
  priceMin: number;
  priceMax: number;
  bedsMin: number;
};

const EMPTY: Filters = { q: '', type: '', transaction: '', city: '', priceMin: 0, priceMax: 0, bedsMin: 0 };

const TYPES = ['Appartement', 'Villa', 'Maison', 'Terrain', 'Magasin', 'Bureau', 'Hangar'];
const TRANSACTIONS = [
  { value: 'Vente', label: 'À vendre' },
  { value: 'Location', label: 'À louer' },
];

const FCFA = new Intl.NumberFormat('fr-FR');

/**
 * Zillow-style /biens layout.
 *
 *   ┌─ filters bar (sticky-top)     ───────────────────────────┐
 *   ├──────────────────────────────┬──────────────────────────┤
 *   │ scrollable card list (58 %)  │  sticky map (42 %)       │
 *   │                              │                          │
 *   └──────────────────────────────┴──────────────────────────┘
 *
 * Card hover → matching map pin highlights; map pin click → card scrolls
 * into view (and highlights). Filters live in React state so the URL is
 * also kept in sync via window.history.replaceState.
 *
 * Mobile (< lg): cards full-width; a floating "Carte" toggle button opens
 * the map full-screen as an overlay.
 */
export default function ListingsView({ properties, cities, hrefByRef, lang }: Props) {
  const [filters, setFilters] = useState<Filters>(() => readFromUrl());
  const [activeRef, setActiveRef] = useState<string | null>(null);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // ── Filtered list ───────────────────────────────────────────
  const filtered = useMemo(() => {
    return properties.filter((p) => {
      if (filters.type && p.type !== filters.type) return false;
      if (filters.transaction && p.transaction_type !== filters.transaction) return false;
      if (filters.city && p.city !== filters.city) return false;
      if (filters.priceMin && p.price < filters.priceMin) return false;
      if (filters.priceMax && filters.priceMax > 0 && p.price > filters.priceMax) return false;
      if (filters.bedsMin && p.bedrooms < filters.bedsMin) return false;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        if (
          !p.title.toLowerCase().includes(q) &&
          !p.city.toLowerCase().includes(q) &&
          !(p.quartier?.toLowerCase().includes(q))
        ) return false;
      }
      return true;
    });
  }, [properties, filters]);

  // ── Sync URL when filters change ────────────────────────────
  useEffect(() => {
    const sp = new URLSearchParams();
    if (filters.q) sp.set('q', filters.q);
    if (filters.type) sp.set('type', filters.type);
    if (filters.transaction) sp.set('transaction', filters.transaction);
    if (filters.city) sp.set('city', filters.city);
    if (filters.priceMin) sp.set('priceMin', String(filters.priceMin));
    if (filters.priceMax) sp.set('priceMax', String(filters.priceMax));
    if (filters.bedsMin) sp.set('bedsMin', String(filters.bedsMin));
    const qs = sp.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState({}, '', url);
  }, [filters]);

  // ── Pin click → scroll card into view + highlight ───────────
  const onPinClick = (ref: string) => {
    setActiveRef(ref);
    const el = cardRefs.current.get(ref);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const activeFilterCount = [
    filters.type,
    filters.transaction,
    filters.city,
    filters.priceMin > 0 ? 1 : '',
    filters.priceMax > 0 ? 1 : '',
    filters.bedsMin > 0 ? 1 : '',
  ].filter(Boolean).length;

  return (
    <div className="min-h-[calc(100vh-78px)]">
      {/* ── Filter bar ──────────────────────────────────────────────── */}
      <div className="sticky top-[78px] z-20 bg-card/95 backdrop-blur border-b border-clay">
        <div className="container py-3 sm:py-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                placeholder="Ville, quartier, mot-clé…"
                className="w-full pl-10 pr-3 py-2.5 rounded-full bg-background border border-clay text-[14px] outline-none focus:border-primary transition"
              />
            </div>

            {/* Quick dropdowns — only show on >=md */}
            <div className="hidden md:flex items-center gap-2 flex-wrap">
              <Select
                value={filters.transaction}
                onChange={(v) => setFilters((f) => ({ ...f, transaction: v }))}
                options={[{ value: '', label: 'Vente / Location' }, ...TRANSACTIONS]}
              />
              <Select
                value={filters.type}
                onChange={(v) => setFilters((f) => ({ ...f, type: v }))}
                options={[{ value: '', label: 'Tous types' }, ...TYPES.map((t) => ({ value: t, label: t }))]}
              />
              <Select
                value={filters.city}
                onChange={(v) => setFilters((f) => ({ ...f, city: v }))}
                options={[{ value: '', label: 'Toutes villes' }, ...cities.map((c) => ({ value: c, label: c }))]}
              />
            </div>

            {/* More filters */}
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className={
                'inline-flex items-center gap-2 px-4 py-2.5 rounded-full border text-[13px] font-semibold transition ' +
                (activeFilterCount > 0
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-clay hover:border-primary')
              }
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtres
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/25 text-[11px]">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY)}
                className="text-[12.5px] text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
              >
                Réinitialiser
              </button>
            )}
          </div>

          {/* Expanded filter drawer */}
          {filtersOpen && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-clay">
              <NumberField
                label="Prix min (FCFA)"
                value={filters.priceMin}
                onChange={(v) => setFilters((f) => ({ ...f, priceMin: v }))}
              />
              <NumberField
                label="Prix max (FCFA)"
                value={filters.priceMax}
                onChange={(v) => setFilters((f) => ({ ...f, priceMax: v }))}
              />
              <NumberField
                label="Chambres min."
                value={filters.bedsMin}
                onChange={(v) => setFilters((f) => ({ ...f, bedsMin: v }))}
              />
              <div className="md:hidden flex flex-col gap-2">
                <Select
                  value={filters.transaction}
                  onChange={(v) => setFilters((f) => ({ ...f, transaction: v }))}
                  options={[{ value: '', label: 'Vente / Location' }, ...TRANSACTIONS]}
                />
                <Select
                  value={filters.type}
                  onChange={(v) => setFilters((f) => ({ ...f, type: v }))}
                  options={[{ value: '', label: 'Tous types' }, ...TYPES.map((t) => ({ value: t, label: t }))]}
                />
                <Select
                  value={filters.city}
                  onChange={(v) => setFilters((f) => ({ ...f, city: v }))}
                  options={[{ value: '', label: 'Toutes villes' }, ...cities.map((c) => ({ value: c, label: c }))]}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Split view ──────────────────────────────────────────────── */}
      <div className="container py-6 lg:py-8">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground font-semibold">{filtered.length}</strong> bien
            {filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
            {filtered.length < properties.length && ` sur ${properties.length}`}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] items-start">
          {/* Cards column */}
          <div>
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-clay bg-card p-10 text-center text-muted-foreground">
                Aucun bien ne correspond à votre recherche.
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setFilters(EMPTY)}
                    className="text-primary font-semibold underline-offset-4 hover:underline"
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                {filtered.map((p) => (
                  <div
                    key={p.reference}
                    ref={(el) => {
                      cardRefs.current.set(p.reference, el);
                    }}
                  >
                    <MiniCard
                      property={p}
                      href={hrefByRef[p.reference] ?? `/biens/${p.reference.toLowerCase()}`}
                      active={activeRef === p.reference}
                      onEnter={() => setActiveRef(p.reference)}
                      onLeave={() => setActiveRef((curr) => (curr === p.reference ? null : curr))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Map column — sticky on lg+, full-screen overlay on mobile */}
          <div className="hidden lg:block lg:sticky lg:top-[170px] rounded-2xl overflow-hidden border border-clay h-[calc(100vh-200px)] min-h-[500px]">
            <ListingsMap
              properties={filtered}
              activeRef={activeRef}
              onPinClick={onPinClick}
            />
          </div>
        </div>
      </div>

      {/* Mobile floating "Carte" toggle */}
      <button
        type="button"
        onClick={() => setMobileMapOpen(true)}
        className="lg:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-primary text-primary-foreground font-semibold shadow-lg"
      >
        <MapIcon className="w-4 h-4" /> Carte ({filtered.length})
      </button>

      {mobileMapOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-clay">
            <span className="font-semibold">{filtered.length} biens sur la carte</span>
            <button
              type="button"
              onClick={() => setMobileMapOpen(false)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-card border border-clay text-[13px] font-semibold"
            >
              <ListIcon className="w-4 h-4" /> Liste
            </button>
          </div>
          <div className="flex-1">
            <ListingsMap
              properties={filtered}
              activeRef={activeRef}
              onPinClick={(ref) => {
                onPinClick(ref);
                setMobileMapOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Small controlled inputs
   ───────────────────────────────────────────────────────────────────── */

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2.5 rounded-full bg-background border border-clay text-[13px] font-medium outline-none focus:border-primary transition"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : '');
  useEffect(() => {
    setDraft(value > 0 ? String(value) : '');
  }, [value]);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          const stripped = e.target.value.replace(/\D/g, '');
          setDraft(stripped);
          onChange(Number(stripped) || 0);
        }}
        placeholder="—"
        className="px-3 py-2 rounded-xl bg-background border border-clay text-[14px] outline-none focus:border-primary transition"
      />
    </label>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   URL ↔ filters
   ───────────────────────────────────────────────────────────────────── */

function readFromUrl(): Filters {
  if (typeof window === 'undefined') return EMPTY;
  const sp = new URLSearchParams(window.location.search);
  return {
    q: sp.get('q') ?? '',
    type: sp.get('type') ?? '',
    transaction: sp.get('transaction') ?? '',
    city: sp.get('city') ?? '',
    priceMin: Number(sp.get('priceMin') ?? 0) || 0,
    priceMax: Number(sp.get('priceMax') ?? 0) || 0,
    bedsMin: Number(sp.get('bedsMin') ?? 0) || 0,
  };
}
