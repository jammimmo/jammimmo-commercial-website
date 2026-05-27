import { useState, useRef, useEffect } from 'react';
import { LANG_LABELS, LANGS, type Lang } from '@/lib/i18n';

interface Props {
  lang: Lang;
  pathname: string;
}

/**
 * Switch URL language by prefixing/replacing /<lang>/ in the current pathname.
 * Default lang (fr) has no prefix.
 */
function rewritePath(pathname: string, target: Lang): string {
  const stripped = pathname.replace(/^\/(en|wo)(\/|$)/, '/').replace(/\/+/g, '/');
  if (target === 'fr') return stripped || '/';
  const base = stripped === '/' ? '' : stripped;
  return `/${target}${base}`;
}

export default function LanguageSwitcher({ lang, pathname }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = LANG_LABELS[lang];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change language"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full hover:bg-white/10 text-sm font-semibold transition"
      >
        <span aria-hidden>{current.flag}</span>
        <span className="hidden sm:inline">{lang.toUpperCase()}</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-2 w-44 rounded-xl border border-clay bg-card text-foreground shadow-xl overflow-hidden"
        >
          {LANGS.map((l) => {
            const label = LANG_LABELS[l];
            const isActive = l === lang;
            return (
              <li key={l}>
                <a
                  href={rewritePath(pathname, l)}
                  role="option"
                  aria-selected={isActive}
                  className={
                    'flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition ' +
                    (isActive ? 'bg-accent text-accent-foreground font-semibold' : 'hover:bg-muted')
                  }
                >
                  <span aria-hidden>{label.flag}</span>
                  <span>{label.native}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
