import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, Maximize } from 'lucide-react';

interface Props {
  images: string[];
  title: string;
  /**
   * Width budget for the strip. Roughly matches the parent column width so
   * the thumbs lay out cleanly. Defaults to 300 px (matches the VideoTour
   * column on the property detail page).
   */
  maxWidth?: number;
}

/**
 * Compact horizontal thumbnail strip that sits directly beneath the video
 * tour on the property detail page. Shows the first 4 photos at small size
 * (≈ 64×48 px each, 4:3 crop). When there are more than 4 photos, the 4th
 * tile becomes a "+N" tile that opens the lightbox at photo #4.
 *
 * Inspired by Compass / Airbnb where the hero media is anchored and small
 * thumbs invite the user to browse without dominating the viewport.
 */
export default function PhotoStrip({ images, title, maxWidth = 300 }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const total = images.length;
  if (total === 0) return null;

  const visibleCount = Math.min(4, total);
  const overflow = total - visibleCount;

  return (
    <>
      <div
        className="rounded-xl bg-card border border-clay px-2 py-2 shadow-sm"
        style={{ maxWidth }}
      >
        <div className="flex gap-2 items-stretch">
          {Array.from({ length: visibleCount }).map((_, i) => {
            const isOverflowTile = i === visibleCount - 1 && overflow > 0;
            const src = images[i];
            return (
              <button
                key={src + i}
                type="button"
                onClick={() => {
                  setActive(i);
                  setOpen(true);
                }}
                aria-label={
                  isOverflowTile
                    ? `Voir les ${overflow + 1} autres photos`
                    : `Voir photo ${i + 1} de ${title}`
                }
                className="relative flex-1 aspect-[4/3] rounded-lg overflow-hidden bg-ink ring-1 ring-clay group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-transform hover:-translate-y-0.5"
              >
                <img
                  src={src}
                  alt={isOverflowTile ? '' : `${title} — photo ${i + 1}`}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
                {isOverflowTile && (
                  <div className="absolute inset-0 bg-primary/85 grid place-items-center text-primary-foreground">
                    <span className="text-[13px] font-semibold tracking-tight">+{overflow + 1}</span>
                  </div>
                )}
                {!isOverflowTile && (
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
          <span className="uppercase tracking-[0.14em] font-semibold flex items-center gap-1.5">
            <Maximize className="w-3 h-3" /> {total} photo{total > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              setActive(0);
              setOpen(true);
            }}
            className="font-semibold text-primary hover:underline"
          >
            Galerie complète
          </button>
        </div>
      </div>

      {open && (
        <Lightbox
          images={images}
          start={active}
          title={title}
          onClose={() => setOpen(false)}
        />
      )}
    </>
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
