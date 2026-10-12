// Tax-law constants for tax year 2026, in 2026 dollars. Indexed amounts are scaled by
// the plan's price index for later years. Sources:
// - IRS Rev. Proc. 2025-32 (brackets, standard deduction, aged add-on, LTCG breakpoints)
// - IRS news release on 2026 adjustments (estate basic exclusion $15,000,000)
// - IRS Publication 590-B, Appendix B, Table III (Uniform Lifetime)
// - CMS fact sheet "2026 Medicare Parts A & B Premiums and Deductibles" (IRMAA)
// - SSA contribution and benefit base for 2026 ($184,500)
// - IRC 86 (Social Security taxation bases) and IRC 1411 (NIIT): fixed by statute, not indexed.

import type { FilingStatus } from './types';

export const TAX_YEAR = 2026;

export const ORDINARY_RATES = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37] as const;

/** Lower bound of each bracket after the first. */
export const ORDINARY_BREAKPOINTS: Record<FilingStatus, readonly number[]> = {
  mfj: [24_800, 100_800, 211_400, 403_550, 512_450, 768_700],
  single: [12_400, 50_400, 105_700, 201_775, 256_225, 640_600],
};

export const STANDARD_DEDUCTION: Record<FilingStatus, number> = { mfj: 32_200, single: 16_100 };

/** Additional standard deduction per person aged 65 or older. */
export const AGED_ADDITIONAL: Record<FilingStatus, number> = { mfj: 1_650, single: 2_050 };

/** Maximum taxable income taxed at 0% and 15% for long-term capital gains. */
export const LTCG_BREAKPOINTS: Record<FilingStatus, readonly [number, number]> = {
  mfj: [98_900, 613_700],
  single: [49_450, 545_500],
};

export const NIIT_RATE = 0.038;
export const NIIT_THRESHOLD: Record<FilingStatus, number> = { mfj: 250_000, single: 200_000 };

/** Provisional-income bases for taxing Social Security benefits. */
export const SS_TAX_BASES: Record<FilingStatus, readonly [number, number]> = {
  mfj: [32_000, 44_000],
  single: [25_000, 34_000],
};

export const SS_WAGE_BASE = 184_500;
export const OASDI_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;
export const ADDITIONAL_MEDICARE_RATE = 0.009;
export const ADDITIONAL_MEDICARE_THRESHOLD: Record<FilingStatus, number> = { mfj: 250_000, single: 200_000 };

/** IRMAA tiers: MAGI lower bounds (exclusive) and monthly Part B + Part D surcharges per person. */
export const IRMAA_TIERS: Record<FilingStatus, readonly { above: number; partB: number; partD: number }[]> = {
  mfj: [
    { above: 218_000, partB: 81.2, partD: 14.5 },
    { above: 274_000, partB: 202.9, partD: 37.5 },
    { above: 342_000, partB: 324.6, partD: 60.4 },
    { above: 410_000, partB: 446.3, partD: 83.3 },
    { above: 749_999.99, partB: 487.0, partD: 91.0 },
  ],
  single: [
    { above: 109_000, partB: 81.2, partD: 14.5 },
    { above: 137_000, partB: 202.9, partD: 37.5 },
    { above: 171_000, partB: 324.6, partD: 60.4 },
    { above: 205_000, partB: 446.3, partD: 83.3 },
    { above: 499_999.99, partB: 487.0, partD: 91.0 },
  ],
};

export const ESTATE_EXCLUSION = 15_000_000;
export const ESTATE_TAX_RATE = 0.4;

/** IRS Pub 590-B Table III. Index 0 is age 72. Ages 120+ use 2.0. */
const UNIFORM_LIFETIME_FROM_72 = [
  27.4, 26.5, 25.5, 24.6, 23.7, 22.9, 22.0, 21.1, 20.2, 19.4, 18.5, 17.7, 16.8, 16.0, 15.2, 14.4, 13.7, 12.9,
  12.2, 11.5, 10.8, 10.1, 9.5, 8.9, 8.4, 7.8, 7.3, 6.8, 6.4, 6.0, 5.6, 5.2, 4.9, 4.6, 4.3, 4.1, 3.9, 3.7, 3.5,
  3.4, 3.3, 3.1, 3.0, 2.9, 2.8, 2.7, 2.5, 2.3, 2.0,
];

export function uniformLifetimeDivisor(age: number): number {
  if (age < 72) throw new RangeError(`no Uniform Lifetime divisor below age 72 (got ${age})`);
  return UNIFORM_LIFETIME_FROM_72[Math.min(age - 72, UNIFORM_LIFETIME_FROM_72.length - 1)];
}

/** SECURE 2.0: RMDs start at 73 for those born 1951-1959 and 75 for those born 1960 or later. */
export function rmdStartAge(birthYear: number): number {
  if (birthYear >= 1960) return 75;
  if (birthYear >= 1951) return 73;
  return 72;
}
