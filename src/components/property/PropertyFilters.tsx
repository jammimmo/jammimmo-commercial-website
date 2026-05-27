import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { PropertyType, TransactionType } from '@/types/property';
import { formatRentalPrice } from '@/lib/format';

interface Props {
  cities: string[];
  /** Initial values from the URL query string. */
  initial?: {
    transaction?: string;
    type?: string;
    city?: string;
    priceMin?: number;
    priceMax?: number;
    q?: string;
  };
}

const TYPES: PropertyType[] = [
  'Appartement', 'Maison', 'Villa', 'Magasin', 'Bureau', 'Hangar', 'Immeuble', 'Terrain', 'Champ agricole',
];
const TRANSACTIONS: TransactionType[] = ['Vente', 'Location', 'Vente & Location'];

const PRICE_STEPS = [
  0, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000,
];

export default function PropertyFilters({ cities, initial = {} }: Props) {
  const [transaction, setTransaction] = useState(initial.transaction ?? '');
  const [type, setType] = useState(initial.type ?? '');
  const [city, setCity] = useState(initial.city ?? '');
  const [priceMin, setPriceMin] = useState<number>(initial.priceMin ?? 0);
  const [priceMax, setPriceMax] = useState<number>(initial.priceMax ?? 0);
  const [q, setQ] = useState(initial.q ?? '');

  // Sync URL with filter state (debounced via useEffect).
  useEffect(() => {
    const params = new URLSearchParams();
    if (transaction) params.set('transaction', transaction);
    if (type) params.set('type', type);
    if (city) params.set('city', city);
    if (priceMin > 0) params.set('priceMin', String(priceMin));
    if (priceMax > 0) params.set('priceMax', String(priceMax));
    if (q.trim()) params.set('q', q.trim());
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState({}, '', url);
    window.dispatchEvent(new CustomEvent('property-filters:change', {
      detail: { transaction, type, city, priceMin, priceMax, q: q.trim() },
    }));
  }, [transaction, type, city, priceMin, priceMax, q]);

  const priceOptions = useMemo(
    () => PRICE_STEPS.map((p) => ({ value: p, label: p === 0 ? 'Sans limite' : formatRentalPrice(p, 'Vente') })),
    [],
  );

  return (
    <div className="bg-card border border-clay rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="lg:col-span-2">
          <label htmlFor="q" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Recherche
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              id="q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Titre, ville, quartier..."
              className="w-full pl-9 pr-3 h-10 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div>
          <label htmlFor="transaction" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Transaction
          </label>
          <select
            id="transaction"
            value={transaction}
            onChange={(e) => setTransaction(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Toutes</option>
            {TRANSACTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="type" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Type
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Tous</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="city" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Ville
          </label>
          <select
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Toutes</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="priceMax" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Budget max
          </label>
          <select
            id="priceMax"
            value={priceMax}
            onChange={(e) => setPriceMax(Number(e.target.value))}
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {priceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
