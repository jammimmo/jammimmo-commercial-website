import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, Maximize } from 'lucide-react';

interface Props {
  images: string[];
  title: string;
}

/**
 * Photo carousel for the property detail page (column 2 of the hero row).
 * Big 16:9 main photo, horizontal thumb strip below, lightbox on click.
 * The video lives in a separate column (see VideoTour) so this component
 * is photos-only — no video integration here.
 */
export default function PropertyGallery({ images, title }: Props) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const total = images.length;

  if (total === 0) {
    return (
      <div className="aspect-[16/9] grid place-items-center bg-muted text-muted-foreground rounded-2xl">
        Pas de photos
      </div>
    );
  }

  return (
    <div className="space-y-3 w-full">
      {/* Main photo: 4:3 — taller than 16:9, fills more of the middle column
          next to the 9:16 video. Matches typical property listing hero. */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-ink group">
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

      {total > 1 && (
        // Thumb strip — bigger thumbs so they read as a proper gallery row
        // rather than a microbar. Auto-fit columns spread evenly to fill the
        // available column width ("étaler").
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.min(total, 5)}, minmax(0, 1fr))` }}
        >
          {images.slice(0, 5).map((src, i) => {
            const isMoreTile = i === 4 && total > 5;
            return (
              <button
                key={src + i}
                type="button"
                onClick={() => (isMoreTile ? setOpen(true) : setActive(i))}
                aria-label={isMoreTile ? `Voir les ${total - 4} autres photos` : `Voir photo ${i + 1}`}
                aria-pressed={!isMoreTile && i === active}
                className={
                  'relative aspect-[4/3] rounded-xl overflow-hidden border-2 transition ' +
                  (!isMoreTile && i === active
                    ? 'border-primary shadow-md'
                    : 'border-transparent hover:border-primary/40')
                }
              >
                <img
                  src={src}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
                {isMoreTile && (
                  <div className="absolute inset-0 bg-primary/85 grid place-items-center text-primary-foreground">
                    <span className="font-serif text-xl">+{total - 4}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <Lightbox images={images} start={active} title={title} onClose={() => setOpen(false)} />
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
