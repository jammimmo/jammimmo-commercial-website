/**
 * Privacy-safe analytics event helper.
 *
 * Routes calls to:
 *   1. The estate-flow Worker at `${PUBLIC_ANALYTICS_ENDPOINT}/api/analytics/*`
 *      (custom OSS backend — owns the data, queryable in estate-flow /analytics).
 *   2. Microsoft Clarity (parallel ground-truth — env-gated by PUBLIC_CLARITY_PROJECT_ID).
 *
 * When `PUBLIC_ANALYTICS_ENDPOINT` is unset, the worker call is skipped silently.
 * When `PUBLIC_CLARITY_PROJECT_ID` is unset, the Clarity script never loads
 * (BaseLayout's conditional). Either way, `track()` never breaks UX.
 *
 * Hard rules enforced by the type signature below:
 *   • Event names are an ALLOWLIST. Adding a new event = update the union.
 *   • Properties are limited to short non-PII keys (ref, slug, type, etc.).
 *     We never accept `name`, `email`, `phone`, `address`, free text, etc.
 *     If you need to pass user-supplied content, hash it client-side first
 *     and document the field as `<thing>Hash`.
 */

export type AnalyticsEvent =
  // Conversion
  | { name: 'lead.form.submitted'; props?: { subject?: string; hasMessage?: boolean; fromProperty?: boolean } }
  | { name: 'phone.tapped'; props?: { source: 'header' | 'detail' | 'contact' | 'drawer' | 'sticky' } }
  | { name: 'whatsapp.tapped'; props?: { source: 'header' | 'detail' | 'contact' | 'drawer' | 'sticky' } }
  | { name: 'directions.tapped'; props?: { source: 'contact' | 'drawer' | 'footer' } }
  // Engagement
  | { name: 'favorite.added'; props?: { ref?: string } }
  | { name: 'favorite.removed'; props?: { ref?: string } }
  | { name: 'compare.added'; props?: { ref?: string } }
  | { name: 'compare.removed'; props?: { ref?: string } }
  // Discovery
  | { name: 'property.viewed'; props?: { ref: string; type: string; transaction: string; quartier?: string } }
  | { name: 'quartier.viewed'; props?: { slug: string } }
  | { name: 'search.performed'; props?: { hasQuery: boolean; type?: string; transaction?: string; city?: string } };

declare global {
  interface Window {
    clarity?: (action: 'set' | 'event' | 'identify', key: string, value?: string) => void;
  }
}

const SESSION_STORAGE_KEY = 'jamm.analytics.sid';

/** Per-tab UUID — survives navigations within the tab, dies on close. */
function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let sid = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sid) {
      // Crypto.randomUUID is available in all modern browsers; fallback for
      // ancient ones is a tolerable Math.random hex string.
      sid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
    }
    return sid;
  } catch {
    // sessionStorage blocked (e.g. privacy mode) — use a stable per-load token.
    return `nostore_${Date.now().toString(36)}`;
  }
}

/** Fully-qualified worker URL or '' if unset. Stripped of trailing slash. */
function endpoint(): string {
  const raw = (import.meta.env.PUBLIC_ANALYTICS_ENDPOINT ?? '').trim();
  return raw.replace(/\/$/, '');
}

interface BaseBody { session_id: string; }
interface PageviewBody extends BaseBody {
  type: 'pageview';
  page_path: string;
  page_title?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  language?: string;
}
interface EventBody extends BaseBody {
  type: 'event';
  name: string;
  props?: Record<string, unknown>;
  page_path?: string;
}

/**
 * Post to the worker using `sendBeacon` first (survives page unload), falling
 * back to `fetch` with `keepalive: true`. Either way, the call is fire-and-
 * forget — we never await it from the UX path.
 */
function postToWorker(path: string, body: PageviewBody | EventBody): void {
  const base = endpoint();
  if (!base) return; // worker not configured → skip silently
  const url = `${base}${path}`;
  try {
    const json = JSON.stringify(body);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([json], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    }
    // Fallback for browsers without sendBeacon support OR when it fails (the
    // queue is full): fetch with keepalive still completes after unload.
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
    }).catch(() => { /* swallow — analytics must never break UX */ });
  } catch {
    /* swallow */
  }
}

/** UTM extraction from the current URL (returns undefined for missing). */
function utmParams(): Pick<PageviewBody, 'utm_source' | 'utm_medium' | 'utm_campaign'> {
  if (typeof window === 'undefined') return {};
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get('utm_source') || undefined,
      utm_medium: p.get('utm_medium') || undefined,
      utm_campaign: p.get('utm_campaign') || undefined,
    };
  } catch {
    return {};
  }
}

/** Fire a pageview to the worker + Clarity. Called once per route load. */
export function trackPageview(): void {
  if (typeof window === 'undefined') return;
  const sid = getSessionId();
  postToWorker('/api/analytics/track', {
    type: 'pageview',
    session_id: sid,
    page_path: window.location.pathname,
    page_title: typeof document !== 'undefined' ? document.title : undefined,
    referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
    language: typeof navigator !== 'undefined' ? navigator.language : undefined,
    ...utmParams(),
  });
  // Clarity captures pageviews on its own; we don't double-fire.
}

/** Fire an analytics event. No-op if no tracker is loaded. */
export function track(event: AnalyticsEvent): void {
  if (typeof window === 'undefined') return;
  const { name, props } = event as { name: string; props?: Record<string, unknown> };
  const sid = getSessionId();

  // Custom backend
  postToWorker('/api/analytics/track', {
    type: 'event',
    session_id: sid,
    name,
    props,
    page_path: window.location.pathname,
  });

  // Microsoft Clarity (parallel ground-truth) — supports custom events via
  // `clarity('event', name)`. Props can't be attached (their API is name-only).
  try {
    if (typeof window.clarity === 'function') {
      window.clarity('event', name);
    }
  } catch {
    /* swallow */
  }
}
