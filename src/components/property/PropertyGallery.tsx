import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Maximize } from 'lucide-react';

interface Props {
  images: string[];
  title: string;
}

/**
 * Photo column for the equal-width hero row on the property detail page.
 *
 * Sits inside a CSS grid cell that stretches to the row height (driven by
 * the 9:16 video next to it). We use a flex column where the two main
 * photos take `flex-1` (sharing the remaining vertical space) and a tiny
 * thumb-row sits at the bottom. End result: the photo column visually
 * fills the same height as the video — no awkward empty space, no overflow.
 *
 *   ┌─────────────────┐
 *   │  Main 4:3-ish   │ flex-1
 *   ├─────────────────┤
 *   │  Secondary      │ flex-1
 *   ├─────────────────┤
 *   │  t1 │ t2 │ t3   │ ~80 px row
 *   └─────────────────┘
 */
export default function PropertyGallery({ images, title }: Props) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const total = images.length;

  if (total === 0) {
    return (
      <div className="aspect-[4/3] grid place-items-center bg-muted text-muted-foreground rounded-2xl h-full">
        Pas de photos
      </div>
    );
  }

  const main = images[active]!;
  const secondaryIdx = total > 1 ? (active + 1) % total : null;
  const secondary = secondaryIdx !== null ? images[secondaryIdx]! : null;

  // Up to 3 thumb tiles. When more photos, last one becomes "+N".
  const thumbCount = Math.min(3, total);
  const overflow = Math.max(0, total - thumbCount);

  return (
    <div className="flex flex-col gap-3 h-full w-full">
      {/* Main photo — fills remaining height with secondary */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Voir photo ${active + 1}`}
        className="relative flex-1 min-h-0 rounded-2xl overflow-hidden bg-ink group"
      >
        <img
          src={main}
          alt={`${title} — photo ${active + 1}`}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
        />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
        <div className="absolute bottom-3 left-3 inline-flex items-center gap-2 bg-black/55 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full backdrop-blur">
          {active + 1} / {total}
        </div>
        <div className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 bg-black/55 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full backdrop-blur">
          <Maximize className="w-3.5 h-3.5" /> Agrandir
        </div>
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActive((i) => (i - 1 + total) % total);
              }}
              aria-label="Image précédente"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActive((i) => (i + 1) % total);
              }}
              aria-label="Image suivante"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70 transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </button>

      {/* Secondary photo (hidden if only one) — also fills remaining height */}
      {secondary && secondaryIdx !== null && (
        <button
          type="button"
          onClick={() => {
            setActive(secondaryIdx);
            setOpen(true);
          }}
          aria-label={`Voir photo ${secondaryIdx + 1}`}
          className="relative flex-1 min-h-0 rounded-2xl overflow-hidden bg-ink group"
        >
          <img
            src={secondary}
            alt={`${title} — photo ${secondaryIdx + 1}`}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
          />
        </button>
      )}

      {/* Bottom thumb strip — fixed height, fills column width */}
      {total > 1 && (
        <div
          className="grid gap-2 h-20"
          style={{ gridTemplateColumns: `repeat(${thumbCount}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: thumbCount }).map((_, i) => {
            const isOverflowTile = i === thumbCount - 1 && overflow > 0;
            const src = images[i]!;
            return (
              <button
                key={src + i}
                type="button"
                onClick={() => (isOverflowTile ? setOpen(true) : setActive(i))}
                aria-label={isOverflowTile ? `Voir les ${overflow + 1} autres photos` : `Voir photo ${i + 1}`}
                aria-pressed={!isOverflowTile && i === active}
                className={
                  'relative rounded-xl overflow-hidden border-2 transition h-full ' +
                  (!isOverflowTile && i === active
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
                {isOverflowTile && (
                  <div className="absolute inset-0 bg-primary/85 grid place-items-center text-primary-foreground">
                    <span className="font-serif text-lg">+{overflow + 1}</span>
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
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Keyboard: Escape closes, ←/→ navigate. Trap focus inside the dialog,
  // restore focus to whatever the user came from on close.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && total > 1) {
        e.preventDefault();
        setActive((i) => (i - 1 + total) % total);
      } else if (e.key === 'ArrowRight' && total > 1) {
        e.preventDefault();
        setActive((i) => (i + 1) % total);
      } else if (e.key === 'Tab') {
        // Naive focus trap: only the close + prev/next buttons matter
        // here, so Tab/Shift+Tab between them cycles within the dialog.
        const focusable = document.querySelectorAll<HTMLElement>(
          '[role="dialog"][aria-modal] button',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    // Lock body scroll while the lightbox is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus();
    };
  }, [total, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photos — ${title}`}
      className="fixed inset-0 z-[100] bg-black/[0.97] backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
    >
      <button
        ref={closeBtnRef}
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute top-4 right-4 w-11 h-11 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
