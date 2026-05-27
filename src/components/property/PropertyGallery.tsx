import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { youtubeIdFromUrl, youtubeAspect, fetchYoutubeAspect } from '@/lib/youtube';

interface Props {
  images: string[];
  videoLinks?: string[];
  title: string;
}

export default function PropertyGallery({ images, videoLinks = [], title }: Props) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const hasImages = images.length > 0;
  const total = images.length;

  // Parse + keep the original URL alongside the ID so we can detect Shorts
  // and ask oEmbed for the true aspect ratio when it differs from the guess.
  const videos = videoLinks
    .map((url) => ({ url, id: youtubeIdFromUrl(url) }))
    .filter((v): v is { url: string; id: string } => v.id !== null);

  if (!hasImages && videos.length === 0) {
    return (
      <div className="aspect-[16/9] grid place-items-center bg-muted text-muted-foreground rounded-2xl">
        Pas d'aperçu disponible
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasImages && (
        <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-ink">
          <img
            src={images[active]}
            alt={`${title} — photo ${active + 1}`}
            className="absolute inset-0 w-full h-full object-cover cursor-zoom-in"
            onClick={() => setOpen(true)}
          />
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => setActive((i) => (i - 1 + total) % total)}
                aria-label="Image précédente"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60 transition"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setActive((i) => (i + 1) % total)}
                aria-label="Image suivante"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60 transition"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur">
                {active + 1} / {total}
              </div>
            </>
          )}
        </div>
      )}

      {total > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Voir photo ${i + 1}`}
              className={
                'shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 transition ' +
                (i === active ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100')
              }
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {videos.length > 0 && (
        <div
          className={
            // One column when *any* video is portrait (Shorts), otherwise the
            // original two-up layout for landscape clips.
            videos.some((v) => /\/shorts\//.test(v.url))
              ? 'grid gap-3 sm:grid-cols-1 sm:max-w-md'
              : 'grid gap-3 sm:grid-cols-2'
          }
        >
          {videos.map((v) => (
            <YoutubeEmbed key={v.id} url={v.url} id={v.id} title={title} />
          ))}
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal
          aria-label="Lightbox"
          className="fixed inset-0 z-[100] bg-black/90 grid place-items-center p-4"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer"
            className="absolute top-4 right-4 w-10 h-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={images[active]}
            alt={`${title} — photo ${active + 1}`}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

/**
 * YouTube iframe sized to the video's actual dimensions. Starts with the
 * URL-derived guess (16:9 or 9:16 for /shorts/), then asks oEmbed for the
 * exact width × height so 4:3 / square / unusual ratios fit precisely.
 */
function YoutubeEmbed({ url, id, title }: { url: string; id: string; title: string }) {
  const [aspect, setAspect] = useState<string>(() => youtubeAspect(url));

  useEffect(() => {
    let cancelled = false;
    fetchYoutubeAspect(url).then((real) => {
      if (!cancelled && real) setAspect(real);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div
      className="overflow-hidden rounded-2xl border border-clay bg-ink"
      style={{ aspectRatio: aspect }}
    >
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title={`Vidéo — ${title}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        className="w-full h-full"
      />
    </div>
  );
}
