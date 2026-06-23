import { describe, it, expect } from 'vitest';
import { computeYield } from './yield-calc';

describe('computeYield', () => {
  it('computes gross/net yield and payback with full occupancy', () => {
    const r = computeYield({ price: 100_000_000, monthlyRent: 1_000_000 });
    expect(r.grossAnnualRent).toBe(12_000_000);
    expect(r.netAnnualIncome).toBe(12_000_000);
    expect(r.grossYieldPct).toBe(12);
    expect(r.netYieldPct).toBe(12);
    // 100M / 12M ≈ 8.3 years
    expect(r.paybackYears).toBeCloseTo(8.3, 1);
  });

  it('subtracts charges and tax from the net', () => {
    const r = computeYield({
      price: 100_000_000,
      monthlyRent: 1_000_000,
      monthlyCharges: 100_000,
      annualTax: 600_000,
    });
    // gross 12M − charges 1.2M − tax 0.6M = 10.2M
    expect(r.netAnnualIncome).toBe(10_200_000);
    expect(r.netYieldPct).toBe(10.2);
    expect(r.monthlyNet).toBe(850_000);
  });

  it('reduces gross rent by vacancy', () => {
    const full = computeYield({ price: 100_000_000, monthlyRent: 1_000_000 });
    const withVacancy = computeYield({ price: 100_000_000, monthlyRent: 1_000_000, vacancyWeeks: 26 });
    expect(withVacancy.grossAnnualRent).toBe(Math.round(full.grossAnnualRent / 2));
  });

  it('returns null yields when price is 0', () => {
    const r = computeYield({ price: 0, monthlyRent: 500_000 });
    expect(r.grossYieldPct).toBeNull();
    expect(r.netYieldPct).toBeNull();
  });

  it('returns null payback when the net income is non-positive', () => {
    const r = computeYield({ price: 50_000_000, monthlyRent: 100_000, monthlyCharges: 200_000 });
    expect(r.netAnnualIncome).toBeLessThanOrEqual(0);
    expect(r.paybackYears).toBeNull();
  });

  it('clamps negative inputs to zero and caps vacancy at 52 weeks', () => {
    const r = computeYield({ price: -1, monthlyRent: -5, vacancyWeeks: 999 });
    expect(r.grossAnnualRent).toBe(0);
    expect(r.grossYieldPct).toBeNull();
  });
});
