/**
 * Click capture for heatmaps (Phase B).
 *
 * A single delegated click listener that records WHERE on the page people
 * click — normalized to 0–1 of the document so the estate-flow dashboard can
 * render a heatmap independent of the visitor's viewport size.
 *
 * Privacy: we only record coordinates + a coarse element selector (tag +
 * nearest id/data-attr). Never text content, never form values.
 *
 * Throttled to avoid flooding the worker on rapid clicks. Fire-and-forget via
 * sendBeacon so it never blocks the UX.
 */

const SESSION_STORAGE_KEY = 'jamm.analytics.sid';

function getSessionId(): string {
  try {
    let sid = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sid) {
      sid =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
    }
    return sid;
  } catch {
    return `nostore_${Date.now().toString(36)}`;
  }
}

function endpoint(): string {
  const raw = (import.meta.env.PUBLIC_ANALYTICS_ENDPOINT ?? '').trim();
  return raw.replace(/\/$/, '');
}

/**
 * Build a short, non-PII selector for the clicked element: prefer a
 * `data-track` / id / aria-label, fall back to the tag name. Capped length.
 */
function describeElement(el: Element | null): string | undefined {
  if (!el) return undefined;
  const node = el as HTMLElement;
  const dataTrack = node.getAttribute?.('data-track');
  if (dataTrack) return `[data-track=${dataTrack}]`.slice(0, 80);
  if (node.id) return `#${node.id}`.slice(0, 80);
  const aria = node.getAttribute?.('aria-label');
  if (aria) return `${node.tagName.toLowerCase()}[aria-label]`.slice(0, 80);
  // class hint (first class only) for a little more granularity
  const cls = typeof node.className === 'string' ? node.className.split(/\s+/)[0] : '';
  return `${node.tagName.toLowerCase()}${cls ? '.' + cls : ''}`.slice(0, 80);
}

let lastSent = 0;
const MIN_INTERVAL_MS = 120; // throttle: at most ~8 clicks/sec recorded

function send(x: number, y: number, selector: string | undefined): void {
  const base = endpoint();
  if (!base) return;
  const body = JSON.stringify({
    session_id: getSessionId(),
    page_path: window.location.pathname,
    x_pct: x,
    y_pct: y,
    viewport_w: window.innerWidth,
    viewport_h: window.innerHeight,
    element_selector: selector,
  });
  const url = `${base}/api/analytics/click`;
  try {
    if (navigator.sendBeacon) {
      if (navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
    }).catch(() => {});
  } catch {
    /* swallow */
  }
}

/** Install the global click listener. Idempotent. */
export function initClickCapture(): void {
  if (typeof window === 'undefined') return;
  if ((window as unknown as { __jammClickCapture?: boolean }).__jammClickCapture) return;
  (window as unknown as { __jammClickCapture?: boolean }).__jammClickCapture = true;

  document.addEventListener(
    'click',
    (e) => {
      const now = Date.now();
      if (now - lastSent < MIN_INTERVAL_MS) return;
      lastSent = now;

      // Normalize to the FULL document height (so a heatmap can show clicks
      // below the fold), using pageX/pageY which include scroll offset.
      const docW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      const docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      const x = docW > 0 ? Math.min(1, Math.max(0, e.pageX / docW)) : 0;
      const y = docH > 0 ? Math.min(1, Math.max(0, e.pageY / docH)) : 0;

      send(x, y, describeElement(e.target as Element | null));
    },
    { passive: true, capture: true },
  );
}
