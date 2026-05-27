/**
 * YouTube URL helpers — used by PropertyCard (hero-image fallback) and
 * PropertyGallery (embed + aspect-ratio detection).
 *
 * No network calls here. Aspect ratio for `/watch?v=…` URLs is unknowable
 * without an oEmbed fetch, so we default to 16:9. `/shorts/` URLs are 9:16.
 */

/** Extract the 11-char YouTube video ID from any common URL form. */
export function youtubeIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1]! : null;
}

/** True if the URL is a YouTube Shorts link (always 9:16 portrait). */
export function isYoutubeShorts(url: string | null | undefined): boolean {
  return !!url && /\/shorts\//.test(url);
}

/**
 * Best-guess aspect ratio for a YouTube URL.
 *   - `/shorts/` → "9 / 16"
 *   - everything else → "16 / 9"
 *
 * For exotic ratios (4:3, square, vertical non-Shorts) the caller should
 * upgrade to a runtime oEmbed fetch (see fetchYoutubeAspect below).
 */
export function youtubeAspect(url: string | null | undefined): string {
  return isYoutubeShorts(url) ? '9 / 16' : '16 / 9';
}

/**
 * Build a thumbnail URL for a YouTube video. `maxresdefault.jpg` is the
 * 1280×720 frame but isn't generated for every video — use `hqdefault.jpg`
 * (480×360) as a safe fallback by handling onError on the <img>.
 */
export function youtubeThumb(
  url: string | null | undefined,
  size: 'hq' | 'maxres' | 'mq' = 'hq',
): string | null {
  const id = youtubeIdFromUrl(url);
  if (!id) return null;
  const file =
    size === 'maxres' ? 'maxresdefault.jpg' : size === 'mq' ? 'mqdefault.jpg' : 'hqdefault.jpg';
  return `https://img.youtube.com/vi/${id}/${file}`;
}

/**
 * Runtime oEmbed lookup for the *actual* width/height of a YouTube video.
 * Returns "width / height" as a CSS aspect-ratio string, or null on failure.
 *
 * Use sparingly — one network round-trip per video. PropertyGallery defers
 * this to a useEffect so the initial render uses the static guess.
 */
export async function fetchYoutubeAspect(url: string): Promise<string | null> {
  try {
    const ep = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(ep, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { width?: number; height?: number };
    if (!j.width || !j.height) return null;
    return `${j.width} / ${j.height}`;
  } catch {
    return null;
  }
}
