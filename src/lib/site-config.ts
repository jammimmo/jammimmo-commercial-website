/**
 * Single source of truth for contact / brand / NAP / social URLs used across
 * the vitrine. Swap a value here and every component (Header, Footer,
 * DetailContent, ContactSection, mobile CTA bar, JSON-LD, legal pages) picks
 * it up.
 *
 * NAP (Name / Address / Phone) consistency is a local-SEO ranking factor:
 * the exact same values must appear on the site, in the schema, and on the
 * Google Business Profile. Keep this file authoritative.
 *
 * Numbers are E.164 (`+221769444849`) where used in `tel:` / `wa.me/`.
 */

export interface SiteConfig {
  /** Full E.164 phone, no spaces — used in `tel:` and `https://wa.me/` */
  phoneE164: string;
  /** Display version with spaces */
  phoneDisplay: string;
  email: string;
  whatsappUrl: string;
  agencyName: string;
  agencyCity: string;
  /** Structured postal address — feeds PostalAddress JSON-LD + footer. */
  address: {
    /** Street + landmark line. */
    street: string;
    locality: string;
    region: string;
    /** ISO-3166-1 alpha-2. */
    country: string;
    /** Human-readable one-liner for footer / contact card. */
    display: string;
  };
  /** Approximate agency pin (Sacré-Cœur 3). Refine via Google Business Profile. */
  geo: { lat: number; lng: number };
  /** Opening hours — display string + schema spec. */
  hours: {
    display: string;
    /** schema.org OpeningHoursSpecification entries. */
    spec: Array<{ days: string[]; opens: string; closes: string }>;
  };
  socials: {
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
  };
  legal: {
    mentions: string;
    privacy: string;
    cookies: string;
  };
}

export const SITE: SiteConfig = {
  phoneE164: '+221769444849',
  phoneDisplay: '+221 76 944 48 49',
  email: 'contact@jammimmo.com',
  whatsappUrl: 'https://wa.me/221769444849',
  agencyName: 'Jamm Immobilier',
  agencyCity: 'Dakar',
  address: {
    street: 'RC 24, Sacré-Cœur 3 (près de chez Omar Pène)',
    locality: 'Dakar',
    region: 'Dakar',
    country: 'SN',
    display: 'RC 24, Sacré-Cœur 3 (près de chez Omar Pène) — Dakar, Sénégal',
  },
  geo: { lat: 14.7237, lng: -17.468 },
  hours: {
    display: 'Lun–Ven · 9h–18h · Sam · 9h–13h',
    spec: [
      { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '18:00' },
      { days: ['Saturday'], opens: '09:00', closes: '13:00' },
    ],
  },
  socials: {
    facebook: 'https://www.facebook.com/jammimmo',
    instagram: 'https://www.instagram.com/jammimmo',
    linkedin: 'https://www.linkedin.com/company/jammimmo',
    youtube: 'https://www.youtube.com/@jammimmo',
  },
  legal: {
    mentions: '/mentions-legales',
    privacy: '/confidentialite',
    cookies: '/cookies',
  },
};

/** `tel:` URI built from `phoneE164`. */
export const TEL_URI = `tel:${SITE.phoneE164}`;
/** `mailto:` URI built from `email`. */
export const MAILTO_URI = `mailto:${SITE.email}`;

/**
 * Google Maps deep links built from the agency address.
 * - MAPS_SEARCH_URI : opens the place on Google Maps (find us).
 * - MAPS_DIRECTIONS_URI : opens turn-by-turn directions to the agency.
 * Both use the documented Maps URL API — no API key, works on web + native
 * Google Maps apps. We query by address text so it resolves to the Business
 * Profile pin once it's claimed.
 */
const MAPS_QUERY = encodeURIComponent(
  `${SITE.agencyName}, ${SITE.address.street}, ${SITE.address.locality}, Sénégal`,
);
export const MAPS_SEARCH_URI = `https://www.google.com/maps/search/?api=1&query=${MAPS_QUERY}`;
export const MAPS_DIRECTIONS_URI = `https://www.google.com/maps/dir/?api=1&destination=${MAPS_QUERY}`;
