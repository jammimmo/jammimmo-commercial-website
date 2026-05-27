import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { t, type Lang, localizedPath } from '@/lib/i18n';
import { COMPARE_KEY, readCompare, writeCompare, clearCompare } from '@/lib/compare';

interface Props {
  lang: Lang;
}

export default function CompareBar({ lang }: Props) {
  const [list, setList] = useState<ReturnType<typeof readCompare>>([]);

  useEffect(() => {
    const refresh = () => setList(readCompare());
    refresh();
    window.addEventListener(`${COMPARE_KEY}:update`, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(`${COMPARE_KEY}:update`, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (list.length === 0) return null;

  const compareHref = localizedPath('/comparer', lang);

  return (
    <div
      role="region"
      aria-label="Comparateur"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl rounded-2xl bg-ink text-background shadow-2xl border border-ink/20 p-3 sm:p-4"
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] uppercase tracking-wider opacity-60 font-semibold">
            {list.length} / 3
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {list.map((p) => (
              <span
                key={p.reference}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/10 text-[12.5px] max-w-[200px]"
              >
                <span className="truncate">{p.title}</span>
                <button
                  type="button"
                  aria-label={`Retirer ${p.title}`}
                  onClick={() => writeCompare(list.filter((x) => x.reference !== p.reference))}
                  className="opacity-70 hover:opacity-100 shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={clearCompare}
            className="text-[12px] font-semibold opacity-70 hover:opacity-100 px-2 py-1.5"
          >
            {t('property.compare.bar.clear', lang)}
          </button>
          <a
            href={compareHref}
            aria-disabled={list.length < 2}
            className={
              'px-3.5 py-2 rounded-full text-[13px] font-semibold transition ' +
              (list.length >= 2
                ? 'bg-secondary text-secondary-foreground hover:translate-y-[-1px]'
                : 'bg-background/15 cursor-not-allowed')
            }
          >
            {t('property.compare.bar.cta', lang)}
          </a>
        </div>
      </div>
    </div>
  );
}
