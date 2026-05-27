import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { t, type Lang, localizedPath } from '@/lib/i18n';
import { readCompare, COMPARE_KEY, clearCompare } from '@/lib/compare';
import { formatRentalPrice } from '@/lib/format';
import { formatPublicRef } from '@/lib/reference';
import type { PublicProperty } from '@/types/property';

interface Props {
  lang: Lang;
}

export default function CompareTable({ lang }: Props) {
  const [refs, setRefs] = useState<string[]>([]);
  const [data, setData] = useState<PublicProperty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const entries = readCompare();
    const list = entries.map((e) => e.reference);
    setRefs(list);
    const refresh = () => {
      const e = readCompare();
      setRefs(e.map((x) => x.reference));
    };
    window.addEventListener(`${COMPARE_KEY}:update`, refresh);
    return () => window.removeEventListener(`${COMPARE_KEY}:update`, refresh);
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
        fetch(`/api/property/${encodeURIComponent(r)}.json`).then((res) => (res.ok ? res.json() : null)),
      ),
    )
      .then((list) => {
        setData(list.filter((p): p is PublicProperty => p !== null));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [refs.join(',')]);

  if (loading) {
    return (
      <div className="grid place-items-center py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-6">{t('page.compare.empty', lang)}</p>
        <a href={localizedPath('/biens', lang)} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold">
          {t('properties.cta.viewAll', lang)}
        </a>
      </div>
    );
  }

  const rows: Array<[string, (p: PublicProperty) => React.ReactNode]> = [
    ['Référence', (p) => formatPublicRef(p.reference)],
    ['Type', (p) => p.type],
    ['Transaction', (p) => p.transaction_type],
    ['Ville', (p) => p.city],
    ['Quartier', (p) => p.quartier],
    ['Prix', (p) => formatRentalPrice(p.price, p.transaction_type)],
    ['Surface', (p) => (p.surface > 0 ? `${p.surface} m²` : '—')],
    ['Chambres', (p) => (p.bedrooms > 0 ? String(p.bedrooms) : '—')],
    ['Commodités', (p) => (p.commodities.length > 0 ? p.commodities.slice(0, 5).join(', ') : '—')],
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={clearCompare}
          className="text-sm text-muted-foreground hover:text-terra"
        >
          Vider la sélection
        </button>
      </div>

      {/* Headers */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `200px repeat(${data.length}, minmax(220px, 1fr))` }}
      >
        <div></div>
        {data.map((p) => (
          <a
            key={p.id}
            href={localizedPath(`/biens/${p.reference.toLowerCase()}`, lang)}
            className="block group"
          >
            <div className="aspect-[4/3] rounded-xl overflow-hidden bg-ink mb-3">
              {p.images[0] ? (
                <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary to-primary/60" />
              )}
            </div>
            <h3 className="font-serif text-lg leading-tight group-hover:text-primary transition">{p.title}</h3>
          </a>
        ))}
      </div>

      {/* Comparison rows */}
      <div className="border border-clay rounded-2xl overflow-hidden bg-card">
        {rows.map(([label, fn], i) => (
          <div
            key={label}
            className={'grid gap-4 px-4 py-3 ' + (i % 2 === 0 ? 'bg-card' : 'bg-background')}
            style={{ gridTemplateColumns: `200px repeat(${data.length}, minmax(220px, 1fr))` }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground self-center">
              {label}
            </div>
            {data.map((p) => (
              <div key={p.id} className="text-sm self-center">{fn(p)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
