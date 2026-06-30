/**
 * Source of truth for the Property shape, kept in sync with the admin DB.
 * After applying a migration on the admin side, regenerate Supabase types:
 *   pnpm dlx supabase gen types typescript --project-id ygaawqgwxlbtkcuqecxh > src/types/supabase.ts
 * and replace the manual shape below with the generated `Database['public']['Tables']['properties']['Row']`.
 */

export type PropertyType =
  | 'Appartement'
  | 'Maison'
  | 'Villa'
  | 'Magasin'
  | 'Bureau'
  | 'Hangar'
  | 'Immeuble'
  | 'Terrain'
  | 'Champ agricole';

export type TransactionType = 'Vente' | 'Location' | 'Vente & Location';

export type PropertyStatus =
  | 'Disponible'
  | 'En cours de vérification'
  | 'Proposé'
  | 'Réservé'
  | 'Vendu / Loué';

export type FluxPassage = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | null;

export interface NearbyCommerce {
  name: string;
  distance: '100m' | '500m' | '1km';
}

/**
 * Public, privacy-safe geolocation of a listing. This is NOT the exact GPS:
 * the centre is a server-side DECOY (180–380 m off the real point, inside the
 * circle but never at it), produced by the salted SQL view
 * `properties_public_geo`. The exact `properties.gps` column is never selected
 * into the public site — see #724972. We render a `radiusM` zone, not a pin.
 */
export interface GpsZone {
  /** Decoy centre latitude (≠ the real position). */
  centerLat: number;
  /** Decoy centre longitude (≠ the real position). */
  centerLng: number;
  /** Radius of the displayed zone, in metres (500 m). */
  radiusM: number;
}

/**
 * The full DB row. We fetch this with the anon key + RLS filtering
 * (is_public = true AND status = 'Disponible'), but we never render the
 * sensitive fields — see the masking step in `lib/property.ts`.
 */
export interface DbProperty {
  id: string;
  reference: string;
  title: string;
  type: PropertyType;
  transaction_type: TransactionType;
  status: PropertyStatus;
  city: string;
  quartier: string;
  address: string | null;
  gps: string | null;
  price: number;
  caution: number;
  avance: number;
  commission_amount: number;
  commercial_message: string;
  negotiable: boolean;
  negotiable_price: number;
  surface: number;
  bedrooms: number;
  images: string[];
  video_links: string[];
  attributes: Record<string, unknown>;
  commodities: string[];
  nearby_commerce: NearbyCommerce[];
  documents: Record<string, string>;
  accessibility: Record<string, boolean>;
  flux_passage: FluxPassage;
  tags: string[];
  description: string;
  is_public: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The masked, render-safe property. Strips commission/source/admin fields.
 * This is the ONLY shape that should ever leave the server boundary.
 */
export interface PublicProperty {
  id: string;
  reference: string;            // displayed truncated as "Ref #00019"
  title: string;
  type: PropertyType;
  transaction_type: TransactionType;
  status: PropertyStatus;
  city: string;
  quartier: string;
  address: string | null;
  /**
   * Privacy-safe fuzzed zone (#724972). NOT the exact GPS — the exact
   * `properties.gps` is never selected into the public site. `null` when the
   * listing has no resolvable point (map falls back to quartier/city).
   */
  geo: GpsZone | null;
  price: number;
  negotiable: boolean;
  commercial_message: string;
  surface: number;
  bedrooms: number;
  images: string[];
  video_links: string[];
  attributes: Record<string, unknown>;
  commodities: string[];
  nearby_commerce: NearbyCommerce[];
  documents: Record<string, string>;
  flux_passage: FluxPassage;
  tags: string[];
  description: string;
  published_at: string | null;
  updated_at: string;
}

/** Form payload for the vitrine contact form, validated by zod. */
export interface LeadInput {
  property_id?: string;
  full_name: string;
  phone: string;
  email?: string;
  message?: string;
}
