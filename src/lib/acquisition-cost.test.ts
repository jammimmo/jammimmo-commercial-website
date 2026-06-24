import { describe, it, expect } from 'vitest';
import {
  computeAcquisitionCost,
  notaryFee,
  REGISTRATION_RATE,
  LAND_REGISTRY_RATE,
  LAND_REGISTRY_FIXED,
  NOTARY_VAT_RATE,
} from './acquisition-cost';

describe('notaryFee — barème dégressif par tranche (Décret 2006-1366 art. 150)', () => {
  it('applies the 4.5% rate within the first tranche', () => {
    expect(notaryFee(10_000_000)).toBe(450_000); // 10M × 4.5%
  });

  it('is exact at the 20M tranche boundary', () => {
    expect(notaryFee(20_000_000)).toBe(900_000); // 20M × 4.5%
  });

  it('sums tranches across the 20→80M band', () => {
    // 20M×4.5% + 30M×3% = 900k + 900k
    expect(notaryFee(50_000_000)).toBe(1_800_000);
    // 20M×4.5% + 60M×3% = 900k + 1.8M
    expect(notaryFee(80_000_000)).toBe(2_700_000);
  });

  it('sums tranches across the 80→300M band', () => {
    // 900k + 1.8M + 120M×1.5%=1.8M
    expect(notaryFee(200_000_000)).toBe(4_500_000);
    // 900k + 1.8M + 220M×1.5%=3.3M
    expect(notaryFee(300_000_000)).toBe(6_000_000);
  });

  it('applies 0.75% above 300M', () => {
    // 6,000,000 (first 300M) + 100M×0.75%=750k
    expect(notaryFee(400_000_000)).toBe(6_750_000);
  });

  it('is zero / clamped for non-positive prices', () => {
    expect(notaryFee(0)).toBe(0);
    expect(notaryFee(-5_000_000)).toBe(0);
  });
});

describe('computeAcquisitionCost — itemized, sourced, deterministic', () => {
  it('matches the worked 50M example line by line', () => {
    const r = computeAcquisitionCost({ price: 50_000_000 });
    expect(r.registration).toBe(2_500_000); // 5%
    expect(r.landRegistry).toBe(506_500); // 1% + 6 500 fixe
    expect(r.notary).toBe(1_800_000); // barème
    expect(r.notaryVat).toBe(324_000); // 18% × 1.8M
    expect(r.total).toBe(5_130_500);
    expect(r.totalWithPrice).toBe(55_130_500);
    expect(r.effectivePct).toBe(10.3);
  });

  it('matches the worked 200M example and lands near the ~8% anchor', () => {
    const r = computeAcquisitionCost({ price: 200_000_000 });
    expect(r.registration).toBe(10_000_000);
    expect(r.landRegistry).toBe(2_006_500);
    expect(r.notary).toBe(4_500_000);
    expect(r.notaryVat).toBe(810_000);
    expect(r.total).toBe(17_316_500);
    expect(r.effectivePct).toBe(8.7);
  });

  it('keeps every individual rate faithful to its statutory basis', () => {
    const price = 120_000_000;
    const r = computeAcquisitionCost({ price });
    expect(r.registration).toBe(Math.round(price * REGISTRATION_RATE));
    expect(r.landRegistry).toBe(Math.round(price * LAND_REGISTRY_RATE) + LAND_REGISTRY_FIXED);
    expect(r.notaryVat).toBe(Math.round(r.notary * NOTARY_VAT_RATE));
    expect(r.total).toBe(r.registration + r.landRegistry + r.notary + r.notaryVat);
    expect(r.totalWithPrice).toBe(price + r.total);
  });

  it('stays within the researched ~7–12% all-in band for realistic prices', () => {
    for (const price of [20_000_000, 50_000_000, 120_000_000, 300_000_000, 500_000_000]) {
      const r = computeAcquisitionCost({ price });
      expect(r.effectivePct).toBeGreaterThanOrEqual(7);
      expect(r.effectivePct).toBeLessThanOrEqual(12);
    }
  });

  it('is regressive — cheaper properties carry a higher fee percentage', () => {
    const cheap = computeAcquisitionCost({ price: 25_000_000 });
    const dear = computeAcquisitionCost({ price: 400_000_000 });
    expect(cheap.effectivePct!).toBeGreaterThan(dear.effectivePct!);
  });

  it('exposes four itemized lines whose sum equals the total', () => {
    const r = computeAcquisitionCost({ price: 75_000_000 });
    expect(r.lines.map((l) => l.key)).toEqual(['registration', 'landRegistry', 'notary', 'notaryVat']);
    expect(r.lines.reduce((s, l) => s + l.amount, 0)).toBe(r.total);
  });

  it('returns a null percentage and zeroed amounts for an empty/zero price', () => {
    const r = computeAcquisitionCost({ price: 0 });
    expect(r.effectivePct).toBeNull();
    expect(r.total).toBe(0);
    expect(r.totalWithPrice).toBe(0);
    expect(r.lines.every((l) => l.amount === 0)).toBe(true);
  });

  it('clamps negative input to zero', () => {
    const r = computeAcquisitionCost({ price: -10_000_000 });
    expect(r.price).toBe(0);
    expect(r.effectivePct).toBeNull();
  });
});
