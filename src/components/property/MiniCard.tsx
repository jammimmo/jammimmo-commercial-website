import { useEffect, useRef, useState } from 'react';
import { Bed, Maximize2, Play, Images } from 'lucide-react';
import type { PublicProperty } from '@/types/property';
import { youtubeIdFromUrl, youtubeThumb } from '@/lib/youtube';

interface Props {
  property: PublicProperty;
  href: string;
  active?: boolean;
  onEnter?: () => void;
  onLeave?: () => void;
}

const FCFA = new Intl.NumberFormat('fr-FR');

function formatPrice(p: PublicProperty): string {
  return p.transaction_type === 'Location'
    ? `${FCFA.format(p.price)} FCFA / mois`
    : `${FCFA.format(p.price)} FCFA`;
}

/**
 * Listing card for /biens — matches the homepage PropertyCard.astro
 * structure:
 *   • Split 4:3 thumbnail when both video + photos exist (lazy-autoplay
 *     video on the left, 2×2 photo mosaic on the right).
 *   • Otherwise: single image fills the thumbnail (video thumb fallback).
 *   • Body: transaction badge, title, beds/m²/location, price.
 *
 * Active state (card hovered or map pin clicked) highlights with the
 * primary border + lifted shadow.
 */
export default function MiniCard({ property: p, href, active, onEnter, onLeave }: Props) {
  const videoId = youtubeIdFromUrl(p.video_links[0]);
  const videoThumb = youtubeThumb(p.video_links[0]);
  const split = !!videoId && p.images.length >= 1;
  const mosaicImgs = p.images.slice(0, 4);
  const heroImage = split ? null : p.images[0] ?? videoThumb;

  return (
    <a
      href={href}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className={
        'group block rounded-2xl overflow-hidden bg-card border transition-all duration-200 ' +
        (active
          ? 'border-primary shadow-[0_18px_40px_-20px_hsl(var(--primary)/.55)] -translate-y-0.5'
          : 'border-clay hover:border-primary/30 hover:shadow-[0_18px_40px_-25px_hsl(var(--ink)/.25)]')
      }
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-ink">
        {split ? (
          <div className="absolute inset-0 grid grid-cols-2 gap-1 bg-ink">
            <VideoThumb videoId={videoId!} videoThumb={videoThumb!} title={p.title} />
            <div className="grid grid-cols-2 grid-rows-2 gap-1">
              {Array.from({ length: 4 }).map((_, i) => {
                const src = mosaicImgs[i] ?? mosaicImgs[mosaicImgs.length - 1];
                return (
                  <div key={i} className="relative overflow-hidden bg-ink">
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : heroImage ? (
          <img
            src={heroImage}
            alt={p.title}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary to-[hsl(var(--primary)/0.6)]" />
        )}

        <span
          className={
            'absolute top-3 left-3 z-[2] inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur ' +
            (p.transaction_type === 'Location'
              ? 'bg-secondary text-secondary-foreground'
              : 'bg-primary text-primary-foreground')
          }
        >
          {p.transaction_type === 'Location' ? 'À louer' : 'À vendre'}
        </span>

        {/* Photo-count badge — Zillow-style */}
        {p.images.length > 0 && (
          <span className="absolute bottom-3 right-3 z-[2] inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-black/55 text-white backdrop-blur">
            <Images className="w-3 h-3" /> {p.images.length}
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="font-serif text-[19px] font-normal tracking-tight">{formatPrice(p)}</div>
        <div className="mt-1.5 text-[14px] font-medium text-foreground/85 line-clamp-1">{p.title}</div>
        <div className="mt-2 flex flex-wrap gap-3 text-[12.5px] text-muted-foreground">
          {p.bedrooms > 0 && (
            <span className="inline-flex items-center gap-1">
              <Bed className="w-3.5 h-3.5" />
              {p.bedrooms} ch
            </span>
          )}
          {p.surface > 0 && (
            <span className="inline-flex items-center gap-1">
              <Maximize2 className="w-3.5 h-3.5" />
              {p.surface} m²
            </span>
          )}
          <span className="inline-flex items-center gap-1">📍 {p.quartier || p.city}</span>
        </div>
      </div>
    </a>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   VideoThumb — lazy-autoplay video tile (left half of the split thumb)
   ───────────────────────────────────────────────────────────────────── */

function VideoThumb({
  videoId,
  videoThumb,
  title,
}: {
  videoId: string;
  videoThumb: string;
  title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!ref.current || mounted) return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setMounted(true);
            obs.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '400px', threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [mounted]);

  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    loop: '1',
    playlist: videoId,
    controls: '0',
    modestbranding: '1',
    playsinline: '1',
    rel: '0',
    iv_load_policy: '3',
    disablekb: '1',
    enablejsapi: '1',
  });

  return (
    <div ref={ref} className="relative overflow-hidden">
      <img
        src={videoThumb}
        alt={`Visite vidéo — ${title}`}
        loading="lazy"
        className={
          'absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ' +
          (mounted ? 'opacity-0' : 'opacity-100')
        }
      />
      {!mounted && (
        <>
          <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/15 pointer-events-none" />
          <span
            className="absolute inset-0 grid place-items-center pointer-events-none"
            aria-hidden="true"
          >
            <span className="w-10 h-10 grid place-items-center rounded-full bg-white/95 text-primary shadow-md">
              <Play className="w-4 h-4" fill="currentColor" />
            </span>
          </span>
        </>
      )}
      {mounted && (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`}
          title={`Vidéo — ${title}`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          // @ts-expect-error iOS Safari uses webkit-playsinline
          playsInline
          loading="lazy"
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ border: 0 }}
          onLoad={(e) => {
            // Belt-and-suspenders for mobile: send postMessage playVideo
            try {
              (e.currentTarget as HTMLIFrameElement).contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
                '*',
              );
              (e.currentTarget as HTMLIFrameElement).contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'mute', args: [] }),
                '*',
              );
            } catch {
              /* swallow */
            }
          }}
        />
      )}
    </div>
  );
}
