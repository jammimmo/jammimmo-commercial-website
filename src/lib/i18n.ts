import fr from '@/i18n/locales/fr.json';
import en from '@/i18n/locales/en.json';
import wo from '@/i18n/locales/wo.json';

export type Lang = 'fr' | 'en' | 'wo';
export const LANGS: Lang[] = ['fr', 'en', 'wo'];
export const DEFAULT_LANG: Lang = 'fr';

export const LANG_LABELS: Record<Lang, { native: string; flag: string }> = {
  fr: { native: 'Français', flag: '🇫🇷' },
  en: { native: 'English', flag: '🇬🇧' },
  wo: { native: 'Wolof', flag: '🇸🇳' },
};

const dicts: Record<Lang, Record<string, string>> = { fr, en, wo } as const;

/** Get the active lang from an Astro request URL. */
export function getLang(url: URL | string): Lang {
  const p = typeof url === 'string' ? url : url.pathname;
  if (p.startsWith('/en/') || p === '/en') return 'en';
  if (p.startsWith('/wo/') || p === '/wo') return 'wo';
  return DEFAULT_LANG;
}

/**
 * Translation lookup. Falls back to French if the key is missing in the
 * target language (so EN/WO incomplete dictionaries don't break pages —
 * useful while EN/WO translations are being filled in).
 */
export function t(key: string, lang: Lang = DEFAULT_LANG): string {
  const dict = dicts[lang];
  if (key in dict) return dict[key]!;
  if (lang !== DEFAULT_LANG && key in dicts[DEFAULT_LANG]) return dicts[DEFAULT_LANG][key]!;
  // Last-resort: return the key itself so a missing translation surfaces
  // visibly in the page rather than rendering as empty string.
  return key;
}

/** Path-prefix helper: t('biens', 'en') → '/en/biens' */
export function localizedPath(path: string, lang: Lang = DEFAULT_LANG): string {
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  if (lang === DEFAULT_LANG) return cleaned;
  return `/${lang}${cleaned}`;
}

/** Build the alternate-language hreflang URLs for a given path. */
export function buildHreflangLinks(
  path: string,
  site: string = 'https://jammimmo.com',
): Array<{ hreflang: string; href: string }> {
  // Strip any leading /en/ or /wo/ from the path so we get the canonical FR path
  const fr = path.replace(/^\/(en|wo)(\/|$)/, '/').replace(/\/$/, '') || '/';
  const base = site.replace(/\/$/, '');
  return [
    { hreflang: 'fr', href: `${base}${fr}` },
    { hreflang: 'en', href: `${base}/en${fr === '/' ? '' : fr}` },
    { hreflang: 'wo', href: `${base}/wo${fr === '/' ? '' : fr}` },
    { hreflang: 'x-default', href: `${base}${fr}` },
  ];
}
