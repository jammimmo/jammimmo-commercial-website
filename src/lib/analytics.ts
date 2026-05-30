/**
 * Privacy-safe analytics event helper.
 *
 * Routes calls to whichever trackers are configured at build time (Umami,
 * Microsoft Clarity). The function is a no-op when no tracker is loaded, so
 * call sites never need to guard. Tracker scripts are themselves env-gated in
 * BaseLayout.astro — set the corresponding `PUBLIC_*` env var to turn one on.
 *
 * Hard rules enforced by the type signature below:
 *   • Event names are an ALLOWLIST. Adding a new event = update the union.
 *   • Properties are limited to short non-PII keys (ref, slug, type, etc.).
 *     We never accept `name`, `email`, `phone`, `address`, free text, etc.
 *     If you need to pass user-supplied content, hash it client-side first
 *     and document the field as `<thing>Hash`.
 *
 * Loaded lazily so call sites never block on tracker JS being ready.
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

interface UmamiAPI {
  track: (eventName: string, eventData?: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    umami?: UmamiAPI;
    clarity?: (action: 'set' | 'event' | 'identify', key: string, value?: string) => void;
  }
}

/** Fire an analytics event. No-op if no tracker is loaded. */
export function track(event: AnalyticsEvent): void {
  if (typeof window === 'undefined') return;
  const { name, props } = event as { name: string; props?: Record<string, unknown> };

  // Umami — its v2 script exposes `window.umami.track`. If the script hasn't
  // loaded yet (script-defer + fast user interaction), Umami queues internally
  // once loaded; we still guard to silently no-op until then.
  try {
    if (window.umami && typeof window.umami.track === 'function') {
      window.umami.track(name, props ?? {});
    }
  } catch {
    /* swallow — analytics must never break UX */
  }

  // Microsoft Clarity — supports custom events via `clarity('event', name)`.
  // Props can't be attached to Clarity events (their API is name-only), so we
  // squash everything down to a single normalized event name for Clarity.
  try {
    if (typeof window.clarity === 'function') {
      window.clarity('event', name);
    }
  } catch {
    /* swallow */
  }
}
