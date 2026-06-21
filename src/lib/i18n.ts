import fr from '@/i18n/locales/fr.json';
import en from '@/i18n/locales/en.json';
import wo from '@/i18n/locales/wo.json';
import es from '@/i18n/locales/es.json';
import it from '@/i18n/locales/it.json';
import ar from '@/i18n/locales/ar.json';

export type Lang = 'fr' | 'en' | 'wo' | 'es' | 'it' | 'ar';
export const LANGS: Lang[] = ['fr', 'en', 'wo', 'es', 'it', 'ar'];
export const DEFAULT_LANG: Lang = 'fr';

/** Languages that are NOT the URL-unprefixed default. Used to build the
 *  getLang prefix matcher + the page-directory generator. */
export const PREFIXED_LANGS: Exclude<Lang, 'fr'>[] = ['en', 'wo', 'es', 'it', 'ar'];

export const LANG_LABELS: Record<Lang, { native: string; flag: string }> = {
  fr: { native: 'Français', flag: '🇫🇷' },
  en: { native: 'English', flag: '🇬🇧' },
  wo: { native: 'Wolof', flag: '🇸🇳' },
  es: { native: 'Español', flag: '🇪🇸' },
  it: { native: 'Italiano', flag: '🇮🇹' },
  ar: { native: 'العربية', flag: '🇸🇦' },
};

/** Writing direction per language. Arabic is right-to-left; everything else
 *  is left-to-right. Drives `<html dir>` + the RTL override layer. */
export const LANG_DIR: Record<Lang, 'ltr' | 'rtl'> = {
  fr: 'ltr',
  en: 'ltr',
  wo: 'ltr',
  es: 'ltr',
  it: 'ltr',
  ar: 'rtl',
};

export function getDir(lang: Lang): 'ltr' | 'rtl' {
  return LANG_DIR[lang] ?? 'ltr';
}

const dicts: Record<Lang, Record<string, string>> = { fr, en, wo, es, it, ar } as const;

/** Get the active lang from an Astro request URL. */
export function getLang(url: URL | string): Lang {
  const p = typeof url === 'string' ? url : url.pathname;
  for (const l of PREFIXED_LANGS) {
    if (p.startsWith(`/${l}/`) || p === `/${l}`) return l;
  }
  return DEFAULT_LANG;
}

/**
 * Translation lookup. Falls back to French if the key is missing in the
 * target language (so still-incomplete dictionaries don't break pages —
 * useful while EN/WO/ES/IT/AR translations are being filled in).
 */
export function t(key: string, lang: Lang = DEFAULT_LANG): string {
  const dict = dicts[lang];
  if (key in dict) return dict[key]!;
  if (lang !== DEFAULT_LANG && key in dicts[DEFAULT_LANG]) return dicts[DEFAULT_LANG][key]!;
  // Last-resort: return the key itself so a missing translation surfaces
  // visibly in the page rather than rendering as empty string.
  return key;
}

/** Path-prefix helper: localizedPath('/biens', 'en') → '/en/biens' */
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
  // Strip any leading locale prefix from the path so we get the canonical FR path.
  const fr = path.replace(/^\/(en|wo|es|it|ar)(\/|$)/, '/').replace(/\/$/, '') || '/';
  const base = site.replace(/\/$/, '');
  const links: Array<{ hreflang: string; href: string }> = LANGS.map((code) => ({
    hreflang: code as string,
    href: code === DEFAULT_LANG ? `${base}${fr}` : `${base}/${code}${fr === '/' ? '' : fr}`,
  }));
  links.push({ hreflang: 'x-default', href: `${base}${fr}` });
  return links;
}
