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
 * **Desktop layout (xl: 1280+)**:
 *   ┌──────────────┬─────────────────────────┐
 *   │              │  main photo (4:3)       │
 *   │  vertical    │                         │
 *   │  9:16 video  ├──────────┬──────────────┤
 *   │              │  thumb   │  thumb       │
 *   │              ├──────────┼──────────────┤
 *   │              │  thumb   │  +N more     │
 *   └──────────────┴──────────┴──────────────┘
 *   The video column is narrow (matches phone aspect) so the photo column
 *   uses a 4:3 main + 2×2 thumb grid to roughly match the video's height.
 *   The split only activates at xl because at lg the photo column would
 *   collapse to ~190 px next to a 360 px sticky price card.
 *
 * **lg (1024–1279)**: gallery STACKS — video on top, photo carousel below
 *   full-width, both fitting the left 2/3 column gracefully.
 *
 * **Mobile (<lg)**: video first, then a horizontal thumbnail strip; no big
 *   main photo, tapping a thumb opens the lightbox.
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
    return <PhotoArea images={images} title={title} variant="standalone" />;
  }

  if (!hasImages) {
    return <VideoBlock videos={videos} title={title} />;
  }

  // Both present: side-by-side at xl, stacked below.
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)] items-start">
      <VideoBlock videos={videos} title={title} />
      <PhotoArea images={images} title={title} variant="paired" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   VIDEO BLOCK — vertical 9:16, centered when stacked, edge-aligned when paired
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
      <div className="flex flex-col gap-3 mx-auto xl:mx-0 w-full max-w-[300px]">
        {videos.map((v) => (
          <div
            key={v.id}
            className="overflow-hidden rounded-2xl border border-clay bg-black w-full shadow-sm ring-1 ring-ink/5"
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
        <p className="text-[12px] uppercase tracking-[0.14em] font-semibold text-muted-foreground text-center xl:text-left flex items-center justify-center xl:justify-start gap-1.5">
          <Play className="w-3 h-3" fill="currentColor" />
          Visite vidéo
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   PHOTO AREA
   - variant="standalone": big 16:9 hero + horizontal thumb strip below
   - variant="paired":
       mobile (< lg): horizontal thumb strip only (no main photo on phone)
       lg          : big 16:9 + horizontal thumb strip
       xl+         : 4:3 main + 2×2 thumb grid (to roughly match video height)
   ───────────────────────────────────────────────────────────────────── */

function PhotoArea({
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
    <div className="space-y-3 w-full">
      {/* Main photo */}
      <div
        className={
          'relative overflow-hidden rounded-2xl bg-ink group ' +
          // Aspect ratio: 16:9 in standalone / lg-paired, 4:3 only at xl-paired
          // so the photo column extends to roughly match the video height.
          (variant === 'paired'
            ? 'aspect-[16/9] xl:aspect-[4/3]'
            : 'aspect-[16/9]') +
          ' ' +
          // Mobile visibility: hide on phone for paired (thumbs are enough).
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

      {/* Thumbnail layout. xl-paired uses a 2×2 grid; otherwise a horizontal
          scrollable strip. The grid layout fills vertical space alongside
          the tall video. */}
      {total > 0 && (
        <ThumbDisplay
          images={images}
          active={active}
          title={title}
          variant={variant}
          onSelect={(i) => {
            setActive(i);
            // On mobile-paired (no main photo visible), tapping a thumb
            // jumps straight into the lightbox to actually see the photo.
            if (
              variant === 'paired' &&
              typeof window !== 'undefined' &&
              window.innerWidth < 1024
            ) {
              setOpen(true);
            }
          }}
          onOpen={() => setOpen(true)}
        />
      )}

      {open && (
        <Lightbox images={images} start={active} title={title} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function ThumbDisplay({
  images,
  active,
  title,
  variant,
  onSelect,
  onOpen,
}: {
  images: string[];
  active: number;
  title: string;
  variant: 'standalone' | 'paired';
  onSelect: (i: number) => void;
  onOpen: () => void;
}) {
  const total = images.length;

  // For the xl-paired variant: build a 2×2 grid that shows 4 thumbs max. The
  // 4th tile becomes a "+N more" tile when there are extra photos beyond.
  // Render BOTH the strip (default + mobile/lg) and the grid (xl only); CSS
  // toggles visibility so we don't run two SSR trees.
  const gridThumbs = images.slice(0, 4);
  const extraCount = Math.max(0, total - 4);

  return (
    <>
      {/* Default: horizontal scroll strip. Hidden at xl when paired. */}
      <div
        className={
          'flex gap-2 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1 snap-x ' +
          (variant === 'paired' ? 'xl:hidden' : '')
        }
      >
        {images.map((src, i) => (
          <button
            key={src + i}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Voir photo ${i + 1} de ${title}`}
            aria-pressed={i === active}
            className={
              'shrink-0 rounded-lg overflow-hidden border-2 transition snap-start ' +
              'w-16 h-12 sm:w-20 sm:h-14 lg:w-24 lg:h-[68px] ' +
              (i === active
                ? 'border-primary shadow-md'
                : 'border-transparent opacity-65 hover:opacity-100')
            }
          >
            <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>

      {/* xl-paired only: 2×2 thumb grid */}
      {variant === 'paired' && total > 0 && (
        <div className="hidden xl:grid grid-cols-2 gap-3">
          {gridThumbs.map((src, i) => {
            const isOverflow = i === 3 && extraCount > 0;
            return (
              <button
                key={src + i}
                type="button"
                onClick={() => (isOverflow ? onOpen() : onSelect(i))}
                aria-label={isOverflow ? `Voir les ${extraCount} autres photos` : `Voir photo ${i + 1} de ${title}`}
                aria-pressed={!isOverflow && i === active}
                className={
                  'relative aspect-[4/3] rounded-xl overflow-hidden border-2 transition ' +
                  (!isOverflow && i === active
                    ? 'border-primary shadow-md'
                    : 'border-transparent hover:border-primary/40')
                }
              >
                <img
                  src={src}
                  alt={isOverflow ? '' : `${title} — photo ${i + 1}`}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
                {isOverflow && (
                  <div className="absolute inset-0 bg-black/60 grid place-items-center text-white">
                    <span className="font-serif text-xl">+{extraCount}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   LIGHTBOX — opaque overlay, keyboard friendly, photo cycling
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
