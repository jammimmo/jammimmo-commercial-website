/**
 * « Frais d'acquisition » — coût total d'achat d'un bien immobilier au Sénégal.
 *
 * HONNÊTETÉ (règle non négociable, identique à estimate-comps / yield-calc) :
 * aucun chiffre inventé. Chaque ligne est un POURCENTAGE STATUTAIRE RÉEL appliqué
 * au prix saisi par l'utilisateur — pas de grille fabriquée, pas de fausse
 * « capacité d'emprunt ». Les taux ci-dessous sont SOURCÉS et corroborés
 * (DGID / Code Général des Impôts / barème notarial), et la périmètre est
 * explicite : REVENTE d'un bien TITRÉ (titre foncier), acheteur particulier.
 *
 * Composantes à la charge de l'ACHETEUR (toutes confirmées par ≥2 sources, dont
 * primaire/officielle) :
 *   1. Droits d'enregistrement     5 %  du prix      — CGI art. 472-II-1°
 *                                                       (Loi 2015-06 : 10 %→5 %,
 *                                                       inchangé en LF 2025).
 *   2. Publicité foncière        ~1 %  du prix       — formalité de la
 *      (conservation foncière)   + ~6 500 FCFA fixe    Conservation (DGID) ;
 *                                                       droit fixe par titre.
 *   3. Honoraires du notaire     barème DÉGRESSIF     — Décret 2006-1366 art. 150
 *      par TRANCHE (chaque tranche à son taux) :
 *          0 →  20 M : 4,50 %
 *         20 →  80 M : 3,00 %
 *         80 → 300 M : 1,50 %
 *           > 300 M  : 0,75 %
 *   4. TVA sur les émoluments    18 %  des honoraires — TVA de droit commun, due
 *                                                       sur l'émolument (pas sur
 *                                                       le prix).
 *
 * HORS PÉRIMÈTRE (volontairement exclus pour rester honnête) :
 *   • Plus-value : à la charge du VENDEUR, jamais de l'acheteur → exclue.
 *   • Droit de timbre (~2 000 FCFA/feuillet) : négligeable et dépend du nombre
 *     de feuillets de l'acte → mentionné dans le disclaimer, PAS chiffré (on
 *     n'invente pas un nombre de pages). Le total est donc légèrement prudent.
 *   • TVA 18 % sur le neuf/VEFA : mécanique différente (remplace parfois
 *     l'enregistrement), sources moins fermes → l'outil cible la revente titrée.
 *   • Commission d'agence : usuellement vendeur, négociable → exclue.
 *
 * Le résultat est une ESTIMATION INDICATIVE : l'UI affiche chaque ligne avec son
 * taux + un disclaimer + un CTA pour obtenir le chiffre exact via Jamm.
 *
 * Sources principales :
 *   • CGI annoté art. 472 — kof-experts.sn/.../CGI-annote-Janvier-2023.pdf
 *   • World Bank, Doing Business 2020 « Registering Property » Sénégal (7,1 %)
 *   • Barème notarial Décret 2006-1366 art. 150
 */

export interface AcquisitionInput {
  /** prix d'achat du bien (FCFA). */
  price: number;
}

/** Une ligne de frais, pour l'affichage itémisé. */
export interface AcquisitionLine {
  key: 'registration' | 'landRegistry' | 'notary' | 'notaryVat';
  amount: number;
}

export interface AcquisitionResult {
  /** prix saisi (FCFA, borné à ≥0). */
  price: number;
  /** droits d'enregistrement = 5 % du prix. */
  registration: number;
  /** publicité foncière = 1 % du prix + droit fixe. */
  landRegistry: number;
  /** honoraires du notaire (barème dégressif par tranche). */
  notary: number;
  /** TVA 18 % sur les honoraires du notaire. */
  notaryVat: number;
  /** somme des 4 frais ci-dessus (FCFA). */
  total: number;
  /** prix + total des frais = budget total à prévoir. */
  totalWithPrice: number;
  /** total / prix × 100 — coût des frais en % (null si prix ≤ 0). */
  effectivePct: number | null;
  /** lignes itémisées, dans l'ordre d'affichage. */
  lines: AcquisitionLine[];
}

/* ─────────────────────────── Taux sourcés ─────────────────────────── */

/** Droits d'enregistrement — CGI art. 472-II-1° (Loi 2015-06). */
export const REGISTRATION_RATE = 0.05;
/** Publicité foncière (conservation) — part proportionnelle. */
export const LAND_REGISTRY_RATE = 0.01;
/** Publicité foncière — droit fixe par titre (~6 500 FCFA). */
export const LAND_REGISTRY_FIXED = 6_500;
/** TVA de droit commun sur les émoluments du notaire. */
export const NOTARY_VAT_RATE = 0.18;

/**
 * Barème notarial DÉGRESSIF par tranche — Décret 2006-1366 art. 150.
 * Chaque tranche est taxée à SON taux (pas un taux unique sur le total).
 */
export const NOTARY_TRANCHES: ReadonlyArray<{ upTo: number; rate: number }> = [
  { upTo: 20_000_000, rate: 0.045 },
  { upTo: 80_000_000, rate: 0.03 },
  { upTo: 300_000_000, rate: 0.015 },
  { upTo: Infinity, rate: 0.0075 },
];

const clampNonNeg = (n: number | undefined): number => (n && n > 0 ? n : 0);
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Honoraires du notaire pour un prix donné, en sommant le barème par tranche.
 * Exporté pour être unit-testé sur les bornes de tranche.
 */
export function notaryFee(price: number): number {
  const p = clampNonNeg(price);
  if (p <= 0) return 0;
  let fee = 0;
  let lower = 0;
  for (const tranche of NOTARY_TRANCHES) {
    if (p <= lower) break;
    const slice = Math.min(p, tranche.upTo) - lower;
    fee += slice * tranche.rate;
    lower = tranche.upTo;
  }
  return Math.round(fee);
}

/**
 * Calcule les frais d'acquisition à la charge de l'acheteur (revente titrée).
 * Fonction pure et déterministe — aucun fetch, aucun secret.
 */
export function computeAcquisitionCost(input: AcquisitionInput): AcquisitionResult {
  const price = clampNonNeg(input.price);

  if (price <= 0) {
    return {
      price: 0,
      registration: 0,
      landRegistry: 0,
      notary: 0,
      notaryVat: 0,
      total: 0,
      totalWithPrice: 0,
      effectivePct: null,
      lines: [
        { key: 'registration', amount: 0 },
        { key: 'landRegistry', amount: 0 },
        { key: 'notary', amount: 0 },
        { key: 'notaryVat', amount: 0 },
      ],
    };
  }

  const registration = Math.round(price * REGISTRATION_RATE);
  const landRegistry = Math.round(price * LAND_REGISTRY_RATE) + LAND_REGISTRY_FIXED;
  const notary = notaryFee(price);
  const notaryVat = Math.round(notary * NOTARY_VAT_RATE);
  const total = registration + landRegistry + notary + notaryVat;

  return {
    price,
    registration,
    landRegistry,
    notary,
    notaryVat,
    total,
    totalWithPrice: price + total,
    effectivePct: round1((total / price) * 100),
    lines: [
      { key: 'registration', amount: registration },
      { key: 'landRegistry', amount: landRegistry },
      { key: 'notary', amount: notary },
      { key: 'notaryVat', amount: notaryVat },
    ],
  };
}
