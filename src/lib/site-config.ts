/**
 * Single source of truth for contact / brand / social URLs used across
 * the vitrine. Swap a value here and every component (Header, Footer,
 * DetailContent, ContactSection, mobile CTA bar, JSON-LD) picks it up.
 *
 * Numbers are E.164 (`+221770000000`) where used in `tel:` / `wa.me/`.
 * The same digits are formatted for display via `formatPhoneFr()`.
 */

export interface SiteConfig {
  /** Full E.164 phone, no spaces — used in `tel:` and `https://wa.me/` */
  phoneE164: string;
  /** Display version with non-breaking spaces */
  phoneDisplay: string;
  email: string;
  whatsappUrl: string;
  agencyName: string;
  agencyCity: string;
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
  phoneE164: '+221770000000',
  phoneDisplay: '+221 77 000 00 00',
  email: 'contact@jammimmo.com',
  whatsappUrl: 'https://wa.me/221770000000',
  agencyName: 'Jamm Immobilier',
  agencyCity: 'Dakar',
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
