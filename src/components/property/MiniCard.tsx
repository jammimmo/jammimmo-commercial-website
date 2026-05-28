import { Bed, Maximize2, MapPin } from 'lucide-react';
import type { PublicProperty } from '@/types/property';

interface Props {
  property: PublicProperty;
  href: string;
  /** When this card's reference matches, highlight (hovered on map or clicked pin). */
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

function youtubeThumb(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

/**
 * Slim listing card used in the Zillow-style /biens split view. Image on top
 * (16:9), price + bed/m² + location stacked underneath. Whole card is a
 * link to the detail page; hovering bubbles up so the parent can highlight
 * the matching map pin.
 */
export default function MiniCard({ property: p, href, active, onEnter, onLeave }: Props) {
  const hero = p.images[0] ?? youtubeThumb(p.video_links[0]) ?? '';
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
      <div className="relative aspect-[16/10] overflow-hidden bg-ink">
        {hero ? (
          <img
            src={hero}
            alt={p.title}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary to-[hsl(var(--primary)/0.6)]" />
        )}
        <span
          className={
            'absolute top-3 left-3 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur ' +
            (p.transaction_type === 'Location'
              ? 'bg-secondary text-secondary-foreground'
              : 'bg-primary text-primary-foreground')
          }
        >
          {p.transaction_type === 'Location' ? 'À louer' : 'À vendre'}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-serif text-[19px] font-normal tracking-tight">{formatPrice(p)}</div>
        </div>
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
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {p.quartier || p.city}
          </span>
        </div>
      </div>
    </a>
  );
}
