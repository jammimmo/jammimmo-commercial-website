/**
 * Session replay recorder (Phase C).
 *
 * Lazily loads rrweb on an idle frame and records DOM mutations for a SAMPLED
 * subset of sessions. Batches are gzip-compressed in the browser
 * (CompressionStream) and POSTed to the estate-flow worker, which stores them
 * in R2 + indexes them in Postgres. The estate-flow Sessions tab plays them
 * back with rrweb-player.
 *
 * Sampling:
 *   • By default record `PUBLIC_REPLAY_SAMPLE_RATE` (0–1, default 0.2 = 20%) of
 *     sessions. The decision is made ONCE per session and stored in
 *     sessionStorage so reloads keep the same decision.
 *   • If a `lead.form.submitted` event fires, recording is force-enabled for
 *     the rest of the session (we want a replay of every conversion). The
 *     vitrine calls `forceReplay()` from the form-submit handler.
 *
 * Privacy:
 *   • `maskAllInputs: true` — typed text is never recorded (shown as •••).
 *   • `maskTextClass` / blocking can be extended if needed.
 *   • Session id is the same per-tab UUID used by the rest of analytics.
 */

const SESSION_STORAGE_KEY = 'jamm.analytics.sid';
const REPLAY_DECISION_KEY = 'jamm.analytics.replay'; // 'on' | 'off'
const BATCH_INTERVAL_MS = 10_000; // flush every 10 s
const BATCH_MAX_BYTES = 50 * 1024; // ...or when the buffer hits 50 KB

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

function sampleRate(): number {
  const raw = Number(import.meta.env.PUBLIC_REPLAY_SAMPLE_RATE ?? 0.2);
  return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.2;
}

/** Decide whether to record this session (memoized in sessionStorage). */
function shouldRecord(): boolean {
  try {
    const existing = window.sessionStorage.getItem(REPLAY_DECISION_KEY);
    if (existing === 'on') return true;
    if (existing === 'off') return false;
    const decision = Math.random() < sampleRate() ? 'on' : 'off';
    window.sessionStorage.setItem(REPLAY_DECISION_KEY, decision);
    return decision === 'on';
  } catch {
    return false;
  }
}

/** Force-enable recording for the rest of the session (called on conversion). */
export function forceReplay(): void {
  try {
    window.sessionStorage.setItem(REPLAY_DECISION_KEY, 'on');
  } catch {
    /* ignore */
  }
  // If recording wasn't started yet (we sampled out earlier), start now.
  if (!started) void startRecording();
}

// ── recorder state ───────────────────────────────────────────────────────
let started = false;
let stopFn: (() => void) | null = null;
let buffer: unknown[] = [];
let batchIndex = 0;
let flushTimer: ReturnType<typeof setInterval> | null = null;

/** gzip-encode a string using the browser CompressionStream API. */
async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return await new Response(stream).blob();
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const events = buffer;
  buffer = [];
  const idx = batchIndex++;

  const base = endpoint();
  if (!base) return;

  try {
    const json = JSON.stringify(events);
    const gz = await gzip(json);
    const form = new FormData();
    form.append(
      'meta',
      JSON.stringify({ session_id: getSessionId(), batch_index: idx, events_count: events.length }),
    );
    form.append('blob', gz, `batch-${idx}.json.gz`);

    // X-Replay-Session lets the worker rate-limit per session without parsing
    // the multipart body first.
    await fetch(`${base}/api/analytics/replay/upload`, {
      method: 'POST',
      headers: { 'X-Replay-Session': getSessionId() },
      body: form,
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
    }).catch(() => {});
  } catch {
    /* swallow — replay must never break UX */
  }
}

async function startRecording(): Promise<void> {
  if (started) return;
  if (!endpoint()) return; // nowhere to send
  // CompressionStream is required; bail on ancient browsers.
  if (typeof CompressionStream === 'undefined') return;
  started = true;

  try {
    const rrweb = await import('rrweb');
    stopFn = rrweb.record({
      emit(event) {
        buffer.push(event);
        // Size-based flush: rough byte estimate to avoid stringify on every event.
        if (buffer.length >= 50) {
          const approxBytes = JSON.stringify(buffer).length;
          if (approxBytes >= BATCH_MAX_BYTES) void flush();
        }
      },
      maskAllInputs: true,
      // Don't record <video>/<iframe> contents (YouTube tour) — saves bytes +
      // avoids cross-origin frame capture warnings.
      recordCanvas: false,
      collectFonts: false,
      sampling: {
        // Throttle high-frequency events; mouse move every 50ms is plenty.
        mousemove: 50,
        scroll: 150,
        media: 800,
      },
    }) ?? null;

    flushTimer = setInterval(() => void flush(), BATCH_INTERVAL_MS);
    // Final flush on unload (sendBeacon-style via keepalive fetch in flush()).
    window.addEventListener('pagehide', () => void flush(), { once: false });
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush();
    });
  } catch {
    started = false;
  }
}

/** Entry point — call once on idle. Records only if sampled in. */
export function initReplayRecorder(): void {
  if (typeof window === 'undefined') return;
  if (!shouldRecord()) return;
  void startRecording();
}

/** Cleanup (mostly for completeness / HMR). */
export function stopReplayRecorder(): void {
  if (stopFn) stopFn();
  if (flushTimer) clearInterval(flushTimer);
  void flush();
  started = false;
}
