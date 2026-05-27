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
 * Layout:
 *   - **Photos**: 16:9 main image + thumbnail strip below. Click → lightbox.
 *   - **Video** (if any) lives in a separate section, see <VideoTourSection/>.
 *     Photos stay the primary surface; the vertical-first phone video is
 *     featured *intentionally* below rather than crammed next to a 16:9
 *     photo (which would force an ugly mismatched-height grid).
 *
 * The single "Photo / Vidéo" tab strip at the top lets the user switch
 * surfaces without scrolling — important on mobile where the video sits a
 * full viewport below the gallery.
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

  return (
    <div className="space-y-8">
      {hasImages && <PhotoCarousel images={images} title={title} hasVideo={videos.length > 0} />}
      {videos.length > 0 && <VideoTourSection videos={videos} title={title} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function PhotoCarousel({
  images,
  title,
  hasVideo,
}: {
  images: string[];
  title: string;
  hasVideo: boolean;
}) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const total = images.length;

  return (
    <div className="space-y-3">
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-ink group">
        <img
          src={images[active]}
          alt={`${title} — photo ${active + 1}`}
          className="absolute inset-0 w-full h-full object-cover cursor-zoom-in transition-transform duration-700 group-hover:scale-[1.02]"
          onClick={() => setOpen(true)}
        />

        {/* Bottom gradient for legibility of badges */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => setActive((i) => (i - 1 + total) % total)}
              aria-label="Image précédente"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70 transition opacity-90 hover:opacity-100"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setActive((i) => (i + 1) % total)}
              aria-label="Image suivante"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70 transition opacity-90 hover:opacity-100"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Counter pill */}
        <div className="absolute bottom-3 left-3 z-[2] inline-flex items-center gap-2 bg-black/55 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full backdrop-blur">
          {active + 1} / {total}
        </div>

        {/* Lightbox CTA + jump-to-video CTA */}
        <div className="absolute bottom-3 right-3 z-[2] flex gap-2">
          {hasVideo && (
            <a
              href="#visite-video"
              className="inline-flex items-center gap-1.5 bg-secondary text-secondary-foreground text-[12px] font-semibold px-3 py-1.5 rounded-full shadow hover:translate-y-[-1px] transition"
            >
              <Play className="w-3.5 h-3.5" fill="currentColor" /> Vidéo
            </a>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Agrandir"
            className="inline-flex items-center gap-1.5 bg-black/55 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full backdrop-blur hover:bg-black/75 transition"
          >
            <Maximize className="w-3.5 h-3.5" /> Agrandir
          </button>
        </div>
      </div>

      {total > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1 snap-x">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Voir photo ${i + 1}`}
              aria-pressed={i === active}
              className={
                'shrink-0 w-24 h-[68px] rounded-lg overflow-hidden border-2 transition snap-start ' +
                (i === active
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
        <Lightbox
          images={images}
          start={active}
          title={title}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function VideoTourSection({
  videos,
  title,
}: {
  videos: Array<{ url: string; id: string }>;
  title: string;
}) {
  return (
    <section id="visite-video" className="scroll-mt-24">
      {/* Mobile: stacked. Desktop: 9:16 player + copy side-by-side so the tall
          aspect ratio doesn't blow out the layout. */}
      <div className="rounded-3xl bg-primary text-primary-foreground overflow-hidden">
        <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center p-5 sm:p-8">
          <div className="flex flex-col items-center gap-4 sm:items-stretch">
            {videos.map((v) => (
              <div
                key={v.id}
                className="overflow-hidden rounded-2xl border border-white/15 bg-black w-full max-w-[280px] sm:w-[280px] mx-auto"
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
          </div>

          <div className="text-center sm:text-left">
            <div className="inline-flex items-center gap-2 text-[12px] font-semibold tracking-[0.14em] uppercase text-secondary mb-3">
              <span className="w-6 h-px bg-secondary" /> Visite guidée
            </div>
            <h2 className="font-serif font-light text-[clamp(24px,3vw,40px)] leading-tight tracking-tight">
              Découvrez le bien en vidéo
            </h2>
            <p className="mt-3 text-primary-foreground/80 text-[15px] leading-relaxed max-w-[36ch] mx-auto sm:mx-0">
              Tour filmé sur place par notre agent. Activez le son pour le commentaire et
              n'hésitez pas à mettre en pause pour observer les détails.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

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
