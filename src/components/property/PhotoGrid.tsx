import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, Maximize } from 'lucide-react';

interface Props {
  images: string[];
  title: string;
}

/**
 * Pinterest / masonry-style photo grid: 2 columns on mobile, 3 on lg, 4 on
 * xl. Each photo keeps its source aspect ratio (heights vary, columns
 * balance naturally) so portrait and landscape shots both look good without
 * being cropped or letter-boxed.
 *
 * Clicking any tile opens a near-opaque lightbox cycling through the full
 * set with keyboard / button nav.
 */
export default function PhotoGrid({ images, title }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  if (images.length === 0) return null;

  return (
    <>
      <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 [column-fill:balance]">
        {images.map((src, i) => (
          <button
            key={src + i}
            type="button"
            onClick={() => {
              setActive(i);
              setOpen(true);
            }}
            aria-label={`Voir photo ${i + 1} de ${title}`}
            className="relative block w-full mb-3 rounded-xl overflow-hidden bg-ink break-inside-avoid group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <img
              src={src}
              alt={`${title} — photo ${i + 1}`}
              loading="lazy"
              decoding="async"
              className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
            <span className="absolute top-2 right-2 w-8 h-8 grid place-items-center rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur">
              <Maximize className="w-3.5 h-3.5" />
            </span>
          </button>
        ))}
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
