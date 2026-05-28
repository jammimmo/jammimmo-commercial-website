import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, Maximize, Play } from 'lucide-react';
import { youtubeIdFromUrl, youtubeAspect } from '@/lib/youtube';

interface Props {
  images: string[];
  videoLinks?: string[];
  title: string;
}

/**
 * Hero gallery for the property detail page.
 *
 * **Desktop layout** (when there's at least one video and one photo):
 *   ┌──────────────┬─────────────────────────────┐
 *   │              │  main photo  (16:9)         │
 *   │  vertical    │                             │
 *   │  9:16 video  ├─────────────────────────────┤
 *   │              │  thumb-strip (horizontal)   │
 *   └──────────────┴─────────────────────────────┘
 * The video column is fixed-narrow (matches a phone-shot aspect) so the
 * photo column can breathe at 16:9; columns are top-aligned and the photo
 * column naturally ends below the video for a clean asymmetric look.
 *
 * **Mobile layout**: video first, full-width-centered; then a horizontal
 * thumbnail strip below — no big main photo on phone, tapping a thumb
 * opens the lightbox.
 *
 * Edge cases: photos-only or video-only fall back to their respective
 * sub-components without the split.
 */
export default function PropertyGallery({ images, videoLinks = [], title }: Props) {
  const hasImages = images.length > 0;
  const videos = (videoLinks ?? [])
    .map((url) => ({ url, id: youtubeIdFromUrl(url) }))
    .filter((v): v is { url: string; id: string } => v.id !== null);

  if (!hasImages && videos.length === 0) {
    return (
      <div className="aspect-[16/9] grid place-items-center bg-muted text-muted-foreground rounded-2xl">
        Pas d'aperçu disponible
      </div>
    );
  }

  if (!videos.length) {
    return <PhotoCarousel images={images} title={title} variant="standalone" />;
  }

  if (!hasImages) {
    return <VideoBlock videos={videos} title={title} />;
  }

  return (
    <div className="grid gap-4 lg:gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start">
      <VideoBlock videos={videos} title={title} />
      <PhotoCarousel images={images} title={title} variant="paired" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   VIDEO BLOCK — vertical 9:16 player, mobile-first
   ───────────────────────────────────────────────────────────────────── */

function VideoBlock({
  videos,
  title,
}: {
  videos: Array<{ url: string; id: string }>;
  title: string;
}) {
  return (
    <div id="visite-video" className="space-y-2 scroll-mt-24">
      <div className="flex flex-col gap-3 mx-auto lg:mx-0 lg:w-full max-w-[340px]">
        {videos.map((v) => (
          <div
            key={v.id}
            className="overflow-hidden rounded-2xl border border-clay bg-black w-full shadow-sm"
            style={{ aspectRatio: youtubeAspect(v.url) }}
          >
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${v.id}`}
              title={`Vidéo — ${title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              className="w-full h-full"
            />
          </div>
        ))}
        <p className="text-[12px] uppercase tracking-[0.14em] font-semibold text-muted-foreground text-center lg:text-left">
          <span className="inline-flex items-center gap-1.5">
            <Play className="w-3 h-3" fill="currentColor" />
            Visite vidéo
          </span>
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   PHOTO CAROUSEL
   - variant="standalone" → big 16:9 hero + thumb strip below
   - variant="paired"     → desktop: big 16:9 + thumbs
                            mobile : just a horizontal thumb strip
   ───────────────────────────────────────────────────────────────────── */

function PhotoCarousel({
  images,
  title,
  variant,
}: {
  images: string[];
  title: string;
  variant: 'standalone' | 'paired';
}) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const total = images.length;
  const showMainOnMobile = variant === 'standalone';

  return (
    <div className="space-y-3">
      {/* Main 16:9 photo. Hidden on mobile in paired mode so video takes the
          visible fold; the thumb strip + lightbox keep photos one tap away. */}
      <div
        className={
          'relative aspect-[16/9] overflow-hidden rounded-2xl bg-ink group ' +
          (showMainOnMobile ? '' : 'hidden lg:block')
        }
      >
        <img
          src={images[active]}
          alt={`${title} — photo ${active + 1}`}
          className="absolute inset-0 w-full h-full object-cover cursor-zoom-in transition-transform duration-700 group-hover:scale-[1.02]"
          onClick={() => setOpen(true)}
        />

        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => setActive((i) => (i - 1 + total) % total)}
              aria-label="Image précédente"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setActive((i) => (i + 1) % total)}
              aria-label="Image suivante"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70 transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        <div className="absolute bottom-3 left-3 z-[2] inline-flex items-center gap-2 bg-black/55 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full backdrop-blur">
          {active + 1} / {total}
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Agrandir"
          className="absolute bottom-3 right-3 z-[2] inline-flex items-center gap-1.5 bg-black/55 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full backdrop-blur hover:bg-black/75 transition"
        >
          <Maximize className="w-3.5 h-3.5" /> Agrandir
        </button>
      </div>

      {/* Thumbnail strip — horizontal scroll. Slightly bigger on desktop so
          the photo column doesn't feel anaemic next to the tall video. */}
      {total > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1 snap-x">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => {
                setActive(i);
                // On mobile-paired (no main photo), open the lightbox so the
                // user can actually see the photo at a useful size.
                if (variant === 'paired' && typeof window !== 'undefined' && window.innerWidth < 1024) {
                  setOpen(true);
                }
              }}
              aria-label={`Voir photo ${i + 1}`}
              aria-pressed={i === active}
              className={
                'shrink-0 rounded-lg overflow-hidden border-2 transition snap-start ' +
                'w-16 h-12 sm:w-20 sm:h-14 lg:w-24 lg:h-[68px] ' +
                (i === active && (showMainOnMobile || true)
                  ? 'border-primary shadow-md'
                  : 'border-transparent opacity-65 hover:opacity-100')
              }
            >
              <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <Lightbox images={images} start={active} title={title} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   LIGHTBOX — full-screen photo viewer
   ───────────────────────────────────────────────────────────────────── */

function Lightbox({
  images,
  start,
  title,
  onClose,
}: {
  images: string[];
  start: number;
  title: string;
  onClose: () => void;
}) {
  const [active, setActive] = useState(start);
  const total = images.length;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Lightbox"
      className="fixed inset-0 z-[100] bg-black/92 grid place-items-center p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute top-4 right-4 w-11 h-11 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="w-5 h-5" />
      </button>
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActive((i) => (i - 1 + total) % total);
            }}
            aria-label="Image précédente"
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActive((i) => (i + 1) % total);
            }}
            aria-label="Image suivante"
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}
      <img
        src={images[active]}
        alt={`${title} — photo ${active + 1}`}
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {total > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-white/10 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full backdrop-blur">
          {active + 1} / {total}
        </div>
      )}
    </div>
  );
}
