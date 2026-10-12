import {
  ADDITIONAL_MEDICARE_RATE,
  ADDITIONAL_MEDICARE_THRESHOLD,
  AGED_ADDITIONAL,
  IRMAA_TIERS,
  LTCG_BREAKPOINTS,
  MEDICARE_RATE,
  NIIT_RATE,
  NIIT_THRESHOLD,
  OASDI_RATE,
  ORDINARY_BREAKPOINTS,
  ORDINARY_RATES,
  SS_TAX_BASES,
  SS_WAGE_BASE,
  STANDARD_DEDUCTION,
} from './constants';
import type { FilingStatus } from './types';

/** Tax on ordinary taxable income. `index` scales 2026 brackets to the target year's dollars. */
export function ordinaryIncomeTax(taxable: number, status: FilingStatus, index: number): number {
  if (taxable <= 0) return 0;
  const bps = ORDINARY_BREAKPOINTS[status];
  let tax = 0;
  let lower = 0;
  for (let i = 0; i < ORDINARY_RATES.length; i++) {
    const upper = i < bps.length ? bps[i] * index : Infinity;
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * ORDINARY_RATES[i];
    lower = upper;
  }
  return tax;
}

/** Marginal ordinary rate at a given taxable income. */
export function marginalOrdinaryRate(taxable: number, status: FilingStatus, index: number): number {
  const bps = ORDINARY_BREAKPOINTS[status];
  let i = 0;
  while (i < bps.length && taxable >= bps[i] * index) i++;
  return ORDINARY_RATES[i];
}

export function standardDeduction(status: FilingStatus, over65Count: number, index: number): number {
  return (STANDARD_DEDUCTION[status] + AGED_ADDITIONAL[status] * over65Count) * index;
}

/** Federal income tax with long-term gains and qualified dividends stacked on top of ordinary income. */
export function federalIncomeTax(args: {
  ordinaryTaxable: number;
  ltcg: number;
  status: FilingStatus;
  index: number;
}): { ordinary: number; ltcg: number } {
  const ordinaryTaxable = Math.max(0, args.ordinaryTaxable);
  const ltcg = Math.max(0, args.ltcg);
  const [zeroTop, fifteenTop] = LTCG_BREAKPOINTS[args.status].map((b) => b * args.index);
  const start = ordinaryTaxable;
  const end = ordinaryTaxable + ltcg;
  const band = (lo: number, hi: number) => Math.max(0, Math.min(end, hi) - Math.max(start, lo));
  return {
    ordinary: ordinaryIncomeTax(ordinaryTaxable, args.status, args.index),
    ltcg: band(zeroTop, fifteenTop) * 0.15 + band(fifteenTop, Infinity) * 0.2,
  };
}

/**
 * Taxable portion of Social Security benefits (IRC 86). `otherIncome` is AGI excluding benefits
 * plus tax-exempt interest. The statutory bases are not inflation indexed, so `_index` is unused
 * by design and kept for a uniform call shape.
 */
export function taxableSocialSecurity(benefits: number, otherIncome: number, status: FilingStatus, _index: number): number {
  if (benefits <= 0) return 0;
  const [base1, base2] = SS_TAX_BASES[status];
  const provisional = otherIncome + benefits / 2;
  if (provisional <= base1) return 0;
  const tier1 = Math.min((provisional - base1) / 2, (base2 - base1) / 2);
  if (provisional <= base2) return Math.min(tier1, benefits / 2);
  const amount = 0.85 * (provisional - base2) + Math.min(tier1, benefits / 2);
  return Math.min(amount, 0.85 * benefits);
}

/** Net investment income tax (IRC 1411). Thresholds are not indexed. */
export function niit(magi: number, netInvestmentIncome: number, status: FilingStatus): number {
  return NIIT_RATE * Math.max(0, Math.min(netInvestmentIncome, magi - NIIT_THRESHOLD[status]));
}

/** Employee share of FICA. `wages` lists each worker's wages. */
export function payrollTax(wages: readonly number[], status: FilingStatus, index: number): number {
  const base = SS_WAGE_BASE * index;
  const total = wages.reduce((a, w) => a + w, 0);
  const oasdi = wages.reduce((a, w) => a + Math.min(Math.max(w, 0), base) * OASDI_RATE, 0);
  const addl = Math.max(0, total - ADDITIONAL_MEDICARE_THRESHOLD[status]) * ADDITIONAL_MEDICARE_RATE;
  return oasdi + total * MEDICARE_RATE + addl;
}

/**
 * Annual IRMAA surcharge (Part B + Part D) for one Medicare enrollee, based on MAGI.
 * Medicare uses MAGI from two years earlier; callers pass that value.
 */
export function irmaaAnnualSurcharge(magi: number, status: FilingStatus, index: number): number {
  let monthly = 0;
  for (const tier of IRMAA_TIERS[status]) {
    if (magi > tier.above * index) monthly = tier.partB + tier.partD;
  }
  return monthly * 12 * index;
}
