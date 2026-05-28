import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, Play } from 'lucide-react';
import { youtubeIdFromUrl, youtubeAspect, youtubeThumb } from '@/lib/youtube';

interface Props {
  images: string[];
  videoLinks?: string[];
  title: string;
}

type Slide =
  | { kind: 'photo'; src: string }
  | { kind: 'video'; url: string; id: string };

/**
 * Classic real-estate hero gallery (Zillow / SeLoger / Idealista pattern):
 *
 *   ┌───────────────────────────────────────────────────────────┐
 *   │            MAIN MEDIA (16:9, photo OR video)              │
 *   └───────────────────────────────────────────────────────────┘
 *   ┌─▶─┬───┬───┬───┬───┐
 *   │ ▶ │ ▢ │ ▢ │ ▢ │ ▢ │   ← thumbnail strip (video thumb first)
 *   └───┴───┴───┴───┴───┘
 *
 * Video slides are prepended to the strip with a play-icon overlay on
 * their YouTube thumbnail so users can switch between the tour video
 * and the photos in one place. When a video is the active slide, the
 * 9:16 iframe sits centered inside the 16:9 frame with dark bars on
 * each side (the classic letterbox).
 *
 * Clicking a photo (not a video) opens a near-opaque lightbox cycling
 * through the photos only.
 */
export default function PropertyGallery({ images, videoLinks = [], title }: Props) {
  const videoSlides: Slide[] = (videoLinks ?? [])
    .map((url) => ({ url, id: youtubeIdFromUrl(url) }))
    .filter((v): v is { url: string; id: string } => v.id !== null)
    .map((v) => ({ kind: 'video' as const, url: v.url, id: v.id }));

  const photoSlides: Slide[] = images.map((src) => ({ kind: 'photo' as const, src }));

  // Videos first — they're the tour, then photos.
  const slides: Slide[] = [...videoSlides, ...photoSlides];

  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  if (slides.length === 0) {
    return (
      <div className="aspect-[16/9] grid place-items-center bg-muted text-muted-foreground rounded-2xl">
        Pas d'aperçu disponible
      </div>
    );
  }

  const current = slides[active]!;

  return (
    <div className="space-y-3">
      {/* Main media — 16:9 frame */}
      <div className="relative aspect-[16/9] rounded-2xl overflow-hidden bg-ink group">
        {current.kind === 'photo' ? (
          <img
            src={current.src}
            alt={`${title} — photo`}
            className="absolute inset-0 w-full h-full object-cover cursor-zoom-in transition-transform duration-700 group-hover:scale-[1.02]"
            onClick={() => setLightbox(true)}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <div
              className="h-full max-h-full bg-black"
              style={{ aspectRatio: youtubeAspect(current.url) }}
            >
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${current.id}?rel=0&modestbranding=1`}
                title={`Vidéo — ${title}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
                className="w-full h-full"
              />
            </div>
          </div>
        )}

        {/* Slide counter / type pill (top-left) */}
        <div className="absolute top-3 left-3 z-[2] inline-flex items-center gap-2 bg-black/55 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full backdrop-blur">
          {current.kind === 'video' && <Play className="w-3 h-3" fill="currentColor" />}
          {active + 1} / {slides.length}
        </div>

        {/* Prev / Next */}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setActive((i) => (i - 1 + slides.length) % slides.length)}
              aria-label="Précédent"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70 transition z-[2]"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setActive((i) => (i + 1) % slides.length)}
              aria-label="Suivant"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70 transition z-[2]"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Thumb strip */}
      {slides.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
          {slides.map((s, i) => {
            const thumb = s.kind === 'photo' ? s.src : youtubeThumb(s.url, 'hq') ?? '';
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={
                  s.kind === 'video'
                    ? `Visite vidéo`
                    : `Voir photo ${i - videoSlides.length + 1}`
                }
                aria-pressed={i === active}
                className={
                  'relative shrink-0 w-24 h-16 sm:w-28 sm:h-[72px] rounded-lg overflow-hidden border-2 transition snap-start ' +
                  (i === active
                    ? 'border-primary shadow-md'
                    : 'border-transparent opacity-65 hover:opacity-100')
                }
              >
                <img
                  src={thumb}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
                {s.kind === 'video' && (
                  <span className="absolute inset-0 grid place-items-center bg-black/40">
                    <span className="w-8 h-8 grid place-items-center rounded-full bg-white/95 text-primary shadow">
                      <Play className="w-4 h-4" fill="currentColor" />
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {lightbox && current.kind === 'photo' && (
        <Lightbox
          images={images}
          start={Math.max(0, active - videoSlides.length)}
          title={title}
          onClose={() => setLightbox(false)}
        />
      )}
    </div>
  );
}

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
      className="fixed inset-0 z-[100] bg-black/[0.97] backdrop-blur-sm grid place-items-center p-4"
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
