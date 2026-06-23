/**
 * Rental-yield calculator — pure, honest deterministic math for the
 * /rentabilite investor tool. No invented numbers: every output is a direct
 * function of the inputs the user provides (price, expected rent, charges,
 * tax, vacancy). The tool's value is doing the arithmetic correctly and
 * transparently, then connecting the investor to real Jamm listings.
 */

export interface YieldInput {
  /** purchase price (FCFA). */
  price: number;
  /** expected monthly rent (FCFA). */
  monthlyRent: number;
  /** recurring monthly costs — syndic, gestion, entretien (FCFA). */
  monthlyCharges?: number;
  /** yearly taxes (FCFA). */
  annualTax?: number;
  /** expected vacant weeks per year (0..52) — models real occupancy. */
  vacancyWeeks?: number;
}

export interface YieldResult {
  /** rent collected over a year after vacancy (FCFA). */
  grossAnnualRent: number;
  /** grossAnnualRent − annual charges − annual tax (FCFA). */
  netAnnualIncome: number;
  /** gross / price × 100 (null if price ≤ 0). */
  grossYieldPct: number | null;
  /** net / price × 100 (null if price ≤ 0). */
  netYieldPct: number | null;
  /** price / netAnnualIncome (null if net ≤ 0). */
  paybackYears: number | null;
  /** average net income per month (FCFA). */
  monthlyNet: number;
}

const clampNonNeg = (n: number | undefined): number => (n && n > 0 ? n : 0);
const round1 = (n: number): number => Math.round(n * 10) / 10;

export function computeYield(input: YieldInput): YieldResult {
  const price = clampNonNeg(input.price);
  const rent = clampNonNeg(input.monthlyRent);
  const charges = clampNonNeg(input.monthlyCharges);
  const tax = clampNonNeg(input.annualTax);
  const vacancy = Math.min(52, clampNonNeg(input.vacancyWeeks));
  const occupancy = (52 - vacancy) / 52;

  const grossAnnualRent = rent * 12 * occupancy;
  const netAnnualIncome = grossAnnualRent - charges * 12 - tax;

  const grossYieldPct = price > 0 ? round1((grossAnnualRent / price) * 100) : null;
  const netYieldPct = price > 0 ? round1((netAnnualIncome / price) * 100) : null;
  const paybackYears = netAnnualIncome > 0 ? round1(price / netAnnualIncome) : null;

  return {
    grossAnnualRent: Math.round(grossAnnualRent),
    netAnnualIncome: Math.round(netAnnualIncome),
    grossYieldPct,
    netYieldPct,
    paybackYears,
    monthlyNet: Math.round(grossAnnualRent / 12 - charges - tax / 12),
  };
}
