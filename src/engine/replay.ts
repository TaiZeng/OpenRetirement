import { HISTORICAL_RETURNS } from '../data/historicalReturns';
import type { MarketYear } from './types';

const BY_YEAR = new Map<number, MarketYear>(
  HISTORICAL_RETURNS.map(([year, stocks, bonds, cash, inflation]) => [year, { stocks, bonds, cash, inflation }]),
);
export const FIRST_DATA_YEAR = HISTORICAL_RETURNS[0][0];
export const LAST_DATA_YEAR = HISTORICAL_RETURNS[HISTORICAL_RETURNS.length - 1][0];

export function marketYear(year: number): MarketYear {
  const m = BY_YEAR.get(year);
  if (!m) throw new RangeError(`no historical data for ${year}`);
  return m;
}

/** Every complete historical sequence of `years` consecutive years, keyed by start year. */
export function historicalSequences(years: number): { startYear: number; markets: MarketYear[] }[] {
  const out: { startYear: number; markets: MarketYear[] }[] = [];
  for (let s = FIRST_DATA_YEAR; s + years - 1 <= LAST_DATA_YEAR; s++) {
    out.push({ startYear: s, markets: Array.from({ length: years }, (_, i) => marketYear(s + i)) });
  }
  return out;
}

/**
 * Trinity-study style replay: a stock/bond portfolio pays an inflation-adjusted withdrawal each
 * year and is rebalanced annually. Each withdrawal is taken at year end and indexed by that year's
 * CPI change, the convention that best reproduces Cooley, Hubbard & Walz (1998) Table 3.
 * A period succeeds when the portfolio never goes below zero.
 */
export function historicalSuccessRate(args: {
  withdrawalRate: number;
  stockPct: number;
  years: number;
  firstStartYear: number;
  lastEndYear: number;
}): { rate: number; successes: number; periods: number; failedStartYears: number[] } {
  const failed: number[] = [];
  let periods = 0;
  for (let start = args.firstStartYear; start + args.years - 1 <= args.lastEndYear; start++) {
    periods++;
    let balance = 1;
    let withdrawal = args.withdrawalRate;
    for (let i = 0; i < args.years; i++) {
      const m = marketYear(start + i);
      withdrawal *= 1 + m.inflation;
      balance = balance * (1 + args.stockPct * m.stocks + (1 - args.stockPct) * m.bonds) - withdrawal;
      if (balance < 0) {
        failed.push(start);
        break;
      }
    }
  }
  if (periods === 0) throw new RangeError('no complete periods in range');
  return { rate: (periods - failed.length) / periods, successes: periods - failed.length, periods, failedStartYears: failed };
}
