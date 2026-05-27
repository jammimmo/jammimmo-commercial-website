import { useState } from 'react';
import { Search } from 'lucide-react';
import { t, type Lang, localizedPath } from '@/lib/i18n';

interface Props { lang: Lang }

const TYPES = ['Appartement', 'Maison', 'Villa', 'Terrain', 'Magasin', 'Bureau', 'Hangar'];
const CITIES = ['Dakar', 'Saly', 'Mbour', 'Thiès', 'Saint-Louis', 'Ziguinchor'];
const BUDGETS = [
  ['20000000', '20 000 000 FCFA'],
  ['50000000', '50 000 000 FCFA'],
  ['100000000', '100 000 000 FCFA'],
  ['250000000', '250 000 000 FCFA'],
  ['0', 'Sans limite'],
];

const TABS: Array<['Vente' | 'Location' | 'Gestion', 'search.tab.vente' | 'search.tab.location' | 'search.tab.gestion']> = [
  ['Vente', 'search.tab.vente'],
  ['Location', 'search.tab.location'],
  ['Gestion', 'search.tab.gestion'],
];

export default function HeroSearch({ lang }: Props) {
  const [tab, setTab] = useState<'Vente' | 'Location' | 'Gestion'>('Vente');
  const [type, setType] = useState('Appartement');
  const [city, setCity] = useState('Dakar');
  const [rooms, setRooms] = useState('1+');
  const [budget, setBudget] = useState('0');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tab === 'Gestion') {
      window.location.assign(localizedPath('/contact?subject=gestion', lang));
      return;
    }
    const params = new URLSearchParams();
    params.set('transaction', tab);
    if (type) params.set('type', type);
    if (city) params.set('city', city);
    if (budget !== '0') params.set('priceMax', budget);
    window.location.assign(`${localizedPath('/biens', lang)}?${params.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="bg-card/95 text-foreground rounded-3xl p-6 sm:p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)] backdrop-blur self-end -translate-y-10"
    >
      <div className="flex gap-1.5 bg-muted p-1.5 rounded-2xl mb-5">
        {TABS.map(([key, tk]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              'flex-1 py-2.5 px-3 rounded-xl text-[13.5px] font-semibold transition ' +
              (tab === key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')
            }
          >
            {t(tk, lang)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5" htmlFor="hs-type">
            {t('search.label.type', lang)}
          </label>
          <select
            id="hs-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5" htmlFor="hs-city">
            {t('search.label.city', lang)}
          </label>
          <select
            id="hs-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {CITIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5" htmlFor="hs-rooms">
            {t('search.label.rooms', lang)}
          </label>
          <select
            id="hs-rooms"
            value={rooms}
            onChange={(e) => setRooms(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option>1+</option><option>2+</option><option>3+</option><option>4+</option><option>5+</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5" htmlFor="hs-budget">
            {t('search.label.budget', lang)}
          </label>
          <select
            id="hs-budget"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {BUDGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <button
        type="submit"
        className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-secondary text-secondary-foreground font-semibold shadow-lg hover:translate-y-[-1px] transition-transform"
      >
        {t('search.submit', lang)}
        <Search className="w-4 h-4" />
      </button>
    </form>
  );
}
