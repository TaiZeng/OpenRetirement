import { describe, expect, it } from 'vitest';
import {
  federalIncomeTax,
  irmaaAnnualSurcharge,
  ordinaryIncomeTax,
  payrollTax,
  taxableSocialSecurity,
} from '../src/engine/tax';
import { ORDINARY_BREAKPOINTS } from '../src/engine/constants';

describe('ordinary income tax, 2026 MFJ (Rev. Proc. 2025-32 Table 1)', () => {
  it('matches the published base tax at every bracket breakpoint', () => {
    const publishedBase = [2_480, 11_600, 35_932, 82_048, 116_896, 206_583.5];
    ORDINARY_BREAKPOINTS.mfj.forEach((bp, i) => {
      expect(ordinaryIncomeTax(bp, 'mfj', 1)).toBeCloseTo(publishedBase[i], 2);
    });
  });

  it('matches the published single base amounts (Table 3)', () => {
    const publishedBase = [1_240, 5_800, 17_966, 41_024, 58_448, 192_979.25];
    ORDINARY_BREAKPOINTS.single.forEach((bp, i) => {
      expect(ordinaryIncomeTax(bp, 'single', 1)).toBeCloseTo(publishedBase[i], 2);
    });
  });

  it('computes mid-bracket tax', () => {
    expect(ordinaryIncomeTax(100_000, 'mfj', 1)).toBeCloseTo(11_504, 2);
    expect(ordinaryIncomeTax(250_000, 'mfj', 1)).toBeCloseTo(45_196, 2);
    expect(ordinaryIncomeTax(0, 'mfj', 1)).toBe(0);
    expect(ordinaryIncomeTax(-5, 'mfj', 1)).toBe(0);
  });

  it('indexes brackets by the price index', () => {
    expect(ordinaryIncomeTax(200_000, 'mfj', 2)).toBeCloseTo(2 * ordinaryIncomeTax(100_000, 'mfj', 1), 6);
  });
});

describe('federal income tax with long-term capital gains stacked on top', () => {
  it('taxes gains at 0% up to the breakpoint and 15% above it', () => {
    // Ordinary taxable 50,000: 2,480 + 12% x 25,200 = 5,504.
    // LTCG 100,000: 48,900 at 0%, 51,100 at 15% = 7,665.
    const r = federalIncomeTax({ ordinaryTaxable: 50_000, ltcg: 100_000, status: 'mfj', index: 1 });
    expect(r.ordinary).toBeCloseTo(5_504, 2);
    expect(r.ltcg).toBeCloseTo(7_665, 2);
  });

  it('applies 20% above the 15% breakpoint', () => {
    const r = federalIncomeTax({ ordinaryTaxable: 600_000, ltcg: 100_000, status: 'mfj', index: 1 });
    // 13,700 at 15%, 86,300 at 20%.
    expect(r.ltcg).toBeCloseTo(13_700 * 0.15 + 86_300 * 0.2, 2);
  });
});

describe('taxable Social Security (IRC 86, Pub 915 worksheet)', () => {
  it('is zero below the first base', () => {
    expect(taxableSocialSecurity(30_000, 10_000, 'mfj', 1)).toBe(0);
  });
  it('uses the 50% tier between bases', () => {
    // provisional = 20,000 + 15,000 = 35,000 -> 50% x 3,000 = 1,500
    expect(taxableSocialSecurity(30_000, 20_000, 'mfj', 1)).toBeCloseTo(1_500, 6);
  });
  it('uses the 85% tier above the second base', () => {
    // provisional = 30,000 + 20,000 = 50,000 -> 0.85 x 6,000 + 6,000 = 11,100
    expect(taxableSocialSecurity(40_000, 30_000, 'mfj', 1)).toBeCloseTo(11_100, 6);
  });
  it('caps at 85% of benefits and the bases are not indexed', () => {
    expect(taxableSocialSecurity(40_000, 500_000, 'mfj', 3)).toBeCloseTo(34_000, 6);
    expect(taxableSocialSecurity(30_000, 20_000, 'mfj', 3)).toBeCloseTo(1_500, 6);
  });
});

describe('IRMAA (CMS 2026)', () => {
  it('is zero at or below the first threshold', () => {
    expect(irmaaAnnualSurcharge(218_000, 'mfj', 1)).toBe(0);
  });
  it('charges the tier-2 Part B and Part D amounts per person', () => {
    expect(irmaaAnnualSurcharge(300_000, 'mfj', 1)).toBeCloseTo(12 * (202.9 + 37.5), 6);
  });
  it('charges the top tier at $750,000', () => {
    expect(irmaaAnnualSurcharge(750_000, 'mfj', 1)).toBeCloseTo(12 * (487 + 91), 6);
    expect(irmaaAnnualSurcharge(749_000, 'mfj', 1)).toBeCloseTo(12 * (446.3 + 83.3), 6);
  });
});

describe('payroll tax', () => {
  it('caps OASDI at the wage base and adds Medicare', () => {
    expect(payrollTax([100_000, 0], 'mfj', 1)).toBeCloseTo(100_000 * 0.0765, 6);
    expect(payrollTax([200_000, 0], 'mfj', 1)).toBeCloseTo(184_500 * 0.062 + 200_000 * 0.0145, 6);
  });
  it('adds the 0.9% additional Medicare tax over $250,000 combined (MFJ)', () => {
    expect(payrollTax([150_000, 150_000], 'mfj', 1)).toBeCloseTo(300_000 * 0.0765 + 50_000 * 0.009, 6);
  });
});
