/**
 * Quartier (neighbourhood) catalogue powering the geo landing pages
 * (/immobilier/<slug>). Each entry is hand-written, unique editorial copy —
 * this is deliberate: thin/duplicate templated pages get filtered by Google,
 * whereas genuine neighbourhood context ranks for long-tail local queries
 * ("appartement à louer Mermoz", "villa Almadies") and is exactly the kind
 * of factual, well-structured text AI answer engines cite.
 *
 * `name` + `aliases` are matched (accent/case-insensitive) against the DB
 * `quartier` field to attach the actual listings to each hub.
 */

import type { LatLng } from './gps';
import type { Lang } from './i18n';
import translations from '@/data/quartier-translations.json';

/** A field localized across the 6 site languages. fr/en are authored inline
 *  below; es/it/ar/wo are merged from quartier-translations.json at load. */
export type L10n<T> = { fr: T; en: T } & Partial<Record<Lang, T>>;

export interface QuartierFaq {
  q: L10n<string>;
  a: L10n<string>;
}

export interface Quartier {
  slug: string;
  /** Canonical display name — should match the DB `quartier` value. */
  name: string;
  city: string;
  geo: LatLng;
  /** Extra DB `quartier` spellings that map to this hub (normalized match). */
  aliases?: string[];
  /** Lead paragraph — unique per quartier. */
  intro: L10n<string>;
  /** 4 short positioning chips. */
  highlights: L10n<string[]>;
  /** SEO meta description (≤155 chars). */
  meta: L10n<string>;
  /** One quartier-specific FAQ (a generic pair is appended at render time). */
  faq: QuartierFaq;
}

/** Pick a localized value, falling back to French if a translation is absent. */
export function pickL10n<T>(map: L10n<T>, lang: Lang): T {
  return (map[lang] ?? map.fr) as T;
}

export const QUARTIERS: Quartier[] = [
  {
    slug: 'sacre-coeur',
    name: 'Sacré-Cœur',
    city: 'Dakar',
    geo: { lat: 14.7237, lng: -17.468 },
    aliases: ['sacre coeur', 'sacré-coeur', 'sacre-coeur 1', 'sacre-coeur 2', 'sacre-coeur 3'],
    intro: {
      fr: "Quartier central et résidentiel de Dakar, Sacré-Cœur conjugue immeubles modernes, commerces de proximité et accès rapide à la VDN et au Plateau. C'est l'un des secteurs les plus recherchés pour la location d'appartements familiaux comme pour l'investissement locatif. Le siège de Jamm Immobilier s'y trouve, à Sacré-Cœur 3.",
      en: "A central, residential district of Dakar, Sacré-Cœur blends modern apartment blocks, local shops and quick access to the VDN highway and downtown Plateau. It's one of the most sought-after areas for family-apartment rentals and buy-to-let investment alike. Jamm Immobilier's office is here, in Sacré-Cœur 3.",
    },
    highlights: {
      fr: ['Central & bien desservi', 'Appartements familiaux', 'Commerces de proximité', 'Fort potentiel locatif'],
      en: ['Central & well-connected', 'Family apartments', 'Local shops', 'Strong rental demand'],
    },
    meta: {
      fr: 'Appartements, bureaux et commerces à vendre ou à louer à Sacré-Cœur, Dakar. Annonces vérifiées par Jamm Immobilier.',
      en: 'Apartments, offices and shops for sale or rent in Sacré-Cœur, Dakar. Verified listings by Jamm Immobilier.',
    },
    faq: {
      q: { fr: 'Pourquoi investir à Sacré-Cœur ?', en: 'Why invest in Sacré-Cœur?' },
      a: {
        fr: "Sa centralité, la demande locative soutenue et la proximité des axes majeurs (VDN, Plateau) en font un quartier où les biens se louent vite et conservent bien leur valeur.",
        en: 'Its central position, steady rental demand and proximity to major routes (VDN, Plateau) mean properties rent quickly and hold their value well.',
      },
    },
  },
  {
    slug: 'almadies',
    name: 'Almadies',
    city: 'Dakar',
    geo: { lat: 14.7445, lng: -17.5161 },
    intro: {
      fr: "Pointe ouest de Dakar et de l'Afrique continentale, les Almadies sont le quartier haut de gamme par excellence : villas avec piscine, résidences sécurisées, restaurants en bord de mer et proximité de l'aéroport historique. Une adresse prisée des familles aisées et de la diaspora.",
      en: "The westernmost point of Dakar and continental Africa, Almadies is Dakar's premier upscale district: villas with pools, gated residences, seafront restaurants and proximity to the historic airport. A favourite of affluent families and the diaspora.",
    },
    highlights: {
      fr: ['Haut de gamme', 'Villas avec piscine', 'Bord de mer', 'Résidences sécurisées'],
      en: ['Upscale', 'Villas with pools', 'Seafront', 'Gated residences'],
    },
    meta: {
      fr: 'Villas, appartements de standing et résidences sécurisées aux Almadies, Dakar. Annonces vérifiées Jamm Immobilier.',
      en: 'Villas, high-end apartments and gated residences in Almadies, Dakar. Verified Jamm Immobilier listings.',
    },
    faq: {
      q: { fr: 'Quel type de biens trouve-t-on aux Almadies ?', en: 'What kind of properties are in Almadies?' },
      a: {
        fr: "Principalement des villas avec piscine, des appartements de standing et des résidences sécurisées. C'est le segment premium du marché dakarois, avec des prestations haut de gamme.",
        en: 'Mainly villas with pools, high-end apartments and gated residences. It is the premium segment of the Dakar market, with upscale finishes and amenities.',
      },
    },
  },
  {
    slug: 'ngor',
    name: 'Ngor',
    city: 'Dakar',
    geo: { lat: 14.7508, lng: -17.5128 },
    intro: {
      fr: "Entre village de pêcheurs authentique et résidences contemporaines, Ngor offre un cadre de vie balnéaire unique face à l'île du même nom. Le quartier séduit pour les résidences secondaires, les locations courte durée et les villas vue mer.",
      en: "Part authentic fishing village, part contemporary residences, Ngor offers a unique seaside setting facing its namesake island. The area appeals for second homes, short-term rentals and sea-view villas.",
    },
    highlights: {
      fr: ['Vue mer', 'Cadre balnéaire', 'Résidences secondaires', 'Location courte durée'],
      en: ['Sea view', 'Seaside setting', 'Second homes', 'Short-term rentals'],
    },
    meta: {
      fr: "Villas vue mer, appartements et résidences secondaires à Ngor, Dakar. Annonces vérifiées Jamm Immobilier.",
      en: 'Sea-view villas, apartments and second homes in Ngor, Dakar. Verified Jamm Immobilier listings.',
    },
    faq: {
      q: { fr: 'Ngor convient-il pour une résidence secondaire ?', en: 'Is Ngor good for a second home?' },
      a: {
        fr: "Tout à fait : le cadre balnéaire, la proximité de la plage et de l'île de Ngor en font un choix prisé pour une résidence secondaire ou un bien en location courte durée.",
        en: 'Absolutely — the seaside setting and proximity to the beach and Ngor island make it a favourite for second homes or short-term rental properties.',
      },
    },
  },
  {
    slug: 'mermoz',
    name: 'Mermoz',
    city: 'Dakar',
    geo: { lat: 14.7036, lng: -17.4727 },
    intro: {
      fr: "Mermoz est un quartier résidentiel central, apprécié pour son calme relatif, sa proximité de l'Université Cheikh Anta Diop et son accès direct à la Corniche Ouest. Idéal pour les appartements familiaux et les bureaux.",
      en: "Mermoz is a central residential district valued for its relative calm, proximity to Cheikh Anta Diop University and direct access to the Corniche Ouest. Ideal for family apartments and offices.",
    },
    highlights: {
      fr: ['Résidentiel & calme', 'Proche Corniche', 'Proche université', 'Appartements & bureaux'],
      en: ['Residential & calm', 'Near the Corniche', 'Near the university', 'Apartments & offices'],
    },
    meta: {
      fr: 'Appartements et bureaux à vendre ou à louer à Mermoz, Dakar. Annonces vérifiées par Jamm Immobilier.',
      en: 'Apartments and offices for sale or rent in Mermoz, Dakar. Verified listings by Jamm Immobilier.',
    },
    faq: {
      q: { fr: 'Mermoz est-il bien desservi ?', en: 'Is Mermoz well-connected?' },
      a: {
        fr: "Oui : le quartier donne accès à la Corniche Ouest et à la VDN, et reste proche du Plateau comme des Almadies, ce qui en fait un point d'ancrage central dans Dakar.",
        en: 'Yes — the area connects to the Corniche Ouest and the VDN, and stays close to both Plateau and Almadies, making it a central anchor within Dakar.',
      },
    },
  },
  {
    slug: 'point-e',
    name: 'Point E',
    city: 'Dakar',
    geo: { lat: 14.6928, lng: -17.4561 },
    intro: {
      fr: "Quartier résidentiel arboré et prisé, le Point E accueille de nombreux sièges, cabinets et ambassades. Ses rues calmes et ses immeubles de standing en font une valeur sûre pour les bureaux comme pour les appartements de qualité.",
      en: "A leafy, sought-after residential district, Point E hosts many headquarters, firms and embassies. Its quiet streets and quality apartment blocks make it a safe bet for both offices and high-quality apartments.",
    },
    highlights: {
      fr: ['Résidentiel arboré', 'Quartier de bureaux', 'Immeubles de standing', 'Valeur sûre'],
      en: ['Leafy residential', 'Office district', 'Quality buildings', 'Safe investment'],
    },
    meta: {
      fr: 'Appartements de standing et bureaux à vendre ou à louer au Point E, Dakar. Annonces vérifiées Jamm Immobilier.',
      en: 'Quality apartments and offices for sale or rent in Point E, Dakar. Verified Jamm Immobilier listings.',
    },
    faq: {
      q: { fr: 'Le Point E convient-il pour des bureaux ?', en: 'Is Point E suitable for offices?' },
      a: {
        fr: "C'est l'un des quartiers de bureaux les plus établis de Dakar, avec de nombreux cabinets, sièges et ambassades, dans un environnement calme et central.",
        en: 'It is one of the most established office districts in Dakar, home to many firms, headquarters and embassies, in a calm and central setting.',
      },
    },
  },
  {
    slug: 'fann',
    name: 'Fann',
    city: 'Dakar',
    geo: { lat: 14.6889, lng: -17.4633 },
    aliases: ['fann residence', 'fann résidence', 'fann hock', 'fann mermoz'],
    intro: {
      fr: "Fann Résidence est l'un des quartiers les plus prestigieux de Dakar : front de Corniche, villas et résidences de standing, proximité des ambassades, de l'hôpital de Fann et de l'université. Une adresse de prestige, très recherchée.",
      en: "Fann Résidence is one of Dakar's most prestigious districts: Corniche frontage, upscale villas and residences, close to embassies, Fann hospital and the university. A prestige address, highly sought-after.",
    },
    highlights: {
      fr: ['Prestige', 'Front de Corniche', 'Proche ambassades', 'Villas & résidences'],
      en: ['Prestige', 'Corniche frontage', 'Near embassies', 'Villas & residences'],
    },
    meta: {
      fr: 'Villas et appartements de prestige à vendre ou à louer à Fann, Dakar. Annonces vérifiées Jamm Immobilier.',
      en: 'Prestige villas and apartments for sale or rent in Fann, Dakar. Verified Jamm Immobilier listings.',
    },
    faq: {
      q: { fr: 'Fann est-il un quartier haut de gamme ?', en: 'Is Fann an upscale district?' },
      a: {
        fr: "Oui, Fann Résidence figure parmi les adresses les plus prestigieuses de Dakar, avec ses villas de front de Corniche et sa proximité du quartier diplomatique.",
        en: 'Yes — Fann Résidence is among the most prestigious addresses in Dakar, with its Corniche-front villas and proximity to the diplomatic quarter.',
      },
    },
  },
  {
    slug: 'plateau',
    name: 'Plateau',
    city: 'Dakar',
    geo: { lat: 14.6708, lng: -17.4322 },
    aliases: ['dakar plateau', 'centre-ville'],
    intro: {
      fr: "Cœur historique et administratif de Dakar, le Plateau concentre l'essentiel des bureaux, banques, ministères et commerces du centre-ville. C'est le quartier de référence pour les locaux commerciaux, les bureaux et les immeubles de rapport.",
      en: "The historic and administrative heart of Dakar, Plateau concentrates most of the city centre's offices, banks, ministries and shops. It's the go-to district for commercial premises, offices and income-generating buildings.",
    },
    highlights: {
      fr: ['Centre-ville', 'Quartier des affaires', 'Bureaux & commerces', 'Immeubles de rapport'],
      en: ['City centre', 'Business district', 'Offices & shops', 'Income buildings'],
    },
    meta: {
      fr: 'Bureaux, commerces et immeubles à vendre ou à louer au Plateau, Dakar centre. Annonces vérifiées Jamm Immobilier.',
      en: 'Offices, shops and buildings for sale or rent in Plateau, downtown Dakar. Verified Jamm Immobilier listings.',
    },
    faq: {
      q: { fr: 'Quel type de biens recherche-t-on au Plateau ?', en: 'What is in demand in Plateau?' },
      a: {
        fr: "Principalement des bureaux, des locaux commerciaux et des immeubles de rapport, le Plateau étant le centre administratif et des affaires de Dakar.",
        en: 'Mainly offices, commercial premises and income-generating buildings, as Plateau is the administrative and business centre of Dakar.',
      },
    },
  },
  {
    slug: 'yoff',
    name: 'Yoff',
    city: 'Dakar',
    geo: { lat: 14.7547, lng: -17.4889 },
    aliases: ['yoff virage', 'yoff layène', 'yoff diamalaye'],
    intro: {
      fr: "Quartier balnéaire en plein essor au nord de Dakar, Yoff mêle traditions léboues, longue plage et nouveaux programmes résidentiels. Sa proximité de l'aéroport historique et de la VDN en fait un secteur dynamique pour l'habitat et l'investissement.",
      en: "A fast-growing seaside district in northern Dakar, Yoff blends Lebou traditions, a long beach and new residential developments. Its proximity to the historic airport and the VDN makes it a dynamic area for housing and investment.",
    },
    highlights: {
      fr: ['Bord de mer', 'En plein essor', 'Programmes neufs', 'Proche VDN'],
      en: ['Seaside', 'Fast-growing', 'New developments', 'Near the VDN'],
    },
    meta: {
      fr: 'Appartements, villas et terrains à vendre ou à louer à Yoff, Dakar. Annonces vérifiées par Jamm Immobilier.',
      en: 'Apartments, villas and land for sale or rent in Yoff, Dakar. Verified listings by Jamm Immobilier.',
    },
    faq: {
      q: { fr: 'Yoff est-il un bon secteur pour investir ?', en: 'Is Yoff a good area to invest?' },
      a: {
        fr: "Yoff connaît un fort développement résidentiel et bénéficie d'un emplacement balnéaire proche de la VDN, ce qui soutient la demande et le potentiel de valorisation.",
        en: 'Yoff is undergoing strong residential growth and enjoys a seaside location near the VDN, which supports demand and capital-appreciation potential.',
      },
    },
  },
  {
    slug: 'grand-yoff',
    name: 'Grand Yoff',
    city: 'Dakar',
    geo: { lat: 14.7381, lng: -17.4559 },
    intro: {
      fr: "Grand Yoff est un quartier populaire et densément peuplé, traversé par la nouvelle voie BRT et bordé par la Route des Niayes. Très commerçant, il offre des opportunités accessibles en appartements, magasins et locaux d'activité.",
      en: "Grand Yoff is a lively, densely populated district crossed by the new BRT line and bordered by the Route des Niayes. Highly commercial, it offers accessible opportunities in apartments, shops and business premises.",
    },
    highlights: {
      fr: ['Populaire & commerçant', 'Sur la voie BRT', 'Prix accessibles', 'Magasins & locaux'],
      en: ['Lively & commercial', 'On the BRT line', 'Accessible prices', 'Shops & premises'],
    },
    meta: {
      fr: "Appartements, magasins et locaux d'activité à Grand Yoff, Dakar. Annonces vérifiées par Jamm Immobilier.",
      en: 'Apartments, shops and business premises in Grand Yoff, Dakar. Verified listings by Jamm Immobilier.',
    },
    faq: {
      q: { fr: 'Pourquoi choisir Grand Yoff ?', en: 'Why choose Grand Yoff?' },
      a: {
        fr: "Pour son dynamisme commerçant, ses prix plus accessibles que les quartiers de standing, et sa desserte par la nouvelle voie BRT qui améliore fortement la mobilité.",
        en: 'For its commercial energy, prices more accessible than upscale districts, and the new BRT line that greatly improves mobility.',
      },
    },
  },
  {
    slug: 'liberte',
    name: 'Liberté',
    city: 'Dakar',
    geo: { lat: 14.7236, lng: -17.4622 },
    aliases: ['liberte 1', 'liberte 2', 'liberte 3', 'liberte 4', 'liberte 5', 'liberte 6', 'liberté 6'],
    intro: {
      fr: "Des Libertés 1 à 6, ce vaste secteur résidentiel central de Dakar est l'un des plus demandés pour la location familiale. Bien desservi et proche de tout, il propose un large choix d'appartements à des prix variés.",
      en: "Spanning Liberté 1 to 6, this large central residential area of Dakar is one of the most in-demand for family rentals. Well-connected and close to everything, it offers a wide range of apartments at varied prices.",
    },
    highlights: {
      fr: ['Central & résidentiel', 'Location familiale', 'Bien desservi', 'Large choix'],
      en: ['Central & residential', 'Family rentals', 'Well-connected', 'Wide choice'],
    },
    meta: {
      fr: 'Appartements à vendre ou à louer à Liberté (1 à 6), Dakar. Annonces vérifiées par Jamm Immobilier.',
      en: 'Apartments for sale or rent in Liberté (1 to 6), Dakar. Verified listings by Jamm Immobilier.',
    },
    faq: {
      q: { fr: 'Liberté est-il adapté aux familles ?', en: 'Is Liberté suitable for families?' },
      a: {
        fr: "Oui, c'est l'un des secteurs les plus prisés pour la location familiale à Dakar, grâce à sa centralité, sa desserte et son large parc d'appartements.",
        en: 'Yes — it is one of the most popular areas for family rentals in Dakar, thanks to its central location, transport links and large stock of apartments.',
      },
    },
  },
  {
    slug: 'parcelles-assainies',
    name: 'Parcelles Assainies',
    city: 'Dakar',
    geo: { lat: 14.7644, lng: -17.4253 },
    aliases: ['parcelles', 'parcelles assainies unite'],
    intro: {
      fr: "Vaste quartier résidentiel organisé en unités, les Parcelles Assainies offrent l'un des meilleurs rapports qualité-prix de Dakar. Familial et bien équipé, le secteur attire primo-accédants et investisseurs à la recherche d'accessibilité.",
      en: "A large residential district organised into units, Parcelles Assainies offers some of the best value for money in Dakar. Family-friendly and well-equipped, it attracts first-time buyers and investors seeking affordability.",
    },
    highlights: {
      fr: ['Bon rapport qualité-prix', 'Familial', 'Primo-accédants', 'Bien équipé'],
      en: ['Great value', 'Family-friendly', 'First-time buyers', 'Well-equipped'],
    },
    meta: {
      fr: 'Appartements, maisons et terrains aux Parcelles Assainies, Dakar. Annonces vérifiées par Jamm Immobilier.',
      en: 'Apartments, houses and land in Parcelles Assainies, Dakar. Verified listings by Jamm Immobilier.',
    },
    faq: {
      q: { fr: 'Les Parcelles Assainies sont-elles accessibles ?', en: 'Are Parcelles Assainies affordable?' },
      a: {
        fr: "C'est l'un des secteurs offrant le meilleur rapport qualité-prix de Dakar, particulièrement adapté aux primo-accédants et aux budgets maîtrisés.",
        en: 'It is one of the best-value areas in Dakar, particularly suited to first-time buyers and controlled budgets.',
      },
    },
  },
  {
    slug: 'ouakam',
    name: 'Ouakam',
    city: 'Dakar',
    geo: { lat: 14.7244, lng: -17.4969 },
    intro: {
      fr: "Au pied du phare des Mamelles et de la Mosquée de la Divinité, Ouakam est un quartier en pleine transformation, entre village lébou et nouvelles résidences. Sa façade littorale et sa centralité en font un secteur très convoité.",
      en: "At the foot of the Mamelles lighthouse and the Mosque of the Divinity, Ouakam is a district in full transformation, between Lebou village and new residences. Its coastal frontage and central position make it highly coveted.",
    },
    highlights: {
      fr: ['Façade littorale', 'En transformation', 'Central', 'Nouvelles résidences'],
      en: ['Coastal frontage', 'Transforming', 'Central', 'New residences'],
    },
    meta: {
      fr: 'Appartements, villas et terrains à Ouakam, Dakar. Annonces vérifiées par Jamm Immobilier.',
      en: 'Apartments, villas and land in Ouakam, Dakar. Verified listings by Jamm Immobilier.',
    },
    faq: {
      q: { fr: 'Ouakam est-il bien situé ?', en: 'Is Ouakam well located?' },
      a: {
        fr: "Très bien : le quartier combine une façade littorale, la proximité des Almadies et de la Corniche, et un accès rapide au reste de Dakar.",
        en: 'Very well — the district combines a coastal frontage, proximity to Almadies and the Corniche, and quick access to the rest of Dakar.',
      },
    },
  },
];

// Merge the es/it/ar/wo translations (authored by translation agents, kept in a
// separate JSON so this file stays readable) into each quartier's inline fr/en.
type QTr = { intro: string; highlights: string[]; meta: string; faqQ: string; faqA: string };
const TR = translations as Record<string, Partial<Record<Lang, QTr>>>;
for (const q of QUARTIERS) {
  const tr = TR[q.slug];
  if (!tr) continue;
  for (const lang of ['es', 'it', 'ar', 'wo'] as const) {
    const t = tr[lang];
    if (!t) continue;
    q.intro[lang] = t.intro;
    q.highlights[lang] = t.highlights;
    q.meta[lang] = t.meta;
    q.faq.q[lang] = t.faqQ;
    q.faq.a[lang] = t.faqA;
  }
}

const QUARTIER_BY_SLUG = new Map(QUARTIERS.map((q) => [q.slug, q]));

export function getQuartier(slug: string): Quartier | undefined {
  return QUARTIER_BY_SLUG.get(slug);
}

/** Normalize a label for matching (lowercase, strip accents + punctuation). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Does a DB `quartier` string belong to this hub? Matches the canonical name
 * or any alias, accent/case-insensitive, and tolerates "Liberté 6" → "liberte".
 */
export function quartierMatches(q: Quartier, dbQuartier: string | null | undefined): boolean {
  if (!dbQuartier) return false;
  const target = norm(dbQuartier);
  const candidates = [q.name, ...(q.aliases ?? [])].map(norm);
  return candidates.some((c) => target === c || target.startsWith(c) || c.startsWith(target));
}
