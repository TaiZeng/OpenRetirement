// Golden test: the 4% rule over historical returns against Cooley, Hubbard & Walz (1998),
// "Retirement Savings: Choosing a Withdrawal Rate That Is Sustainable", AAII Journal 20(2),
// Table 3 (inflation-adjusted withdrawals, 1926-1995). Published values are whole percents.
import { describe, expect, it } from 'vitest';
import { historicalSuccessRate } from '../../src/engine/replay';

const TABLE_3_FOUR_PERCENT: { stockPct: number; years: number; published: number }[] = [
  { stockPct: 1, years: 15, published: 100 },
  { stockPct: 1, years: 20, published: 100 },
  { stockPct: 1, years: 25, published: 100 },
  { stockPct: 1, years: 30, published: 95 },
  { stockPct: 0.75, years: 15, published: 100 },
  { stockPct: 0.75, years: 20, published: 100 },
  { stockPct: 0.75, years: 25, published: 100 },
  { stockPct: 0.75, years: 30, published: 98 },
  { stockPct: 0.5, years: 15, published: 100 },
  { stockPct: 0.5, years: 20, published: 100 },
  { stockPct: 0.5, years: 25, published: 100 },
  { stockPct: 0.5, years: 30, published: 95 },
  { stockPct: 0.25, years: 15, published: 100 },
  { stockPct: 0.25, years: 20, published: 100 },
  { stockPct: 0.25, years: 25, published: 93 },
  { stockPct: 0.25, years: 30, published: 71 },
  { stockPct: 0, years: 15, published: 100 },
  { stockPct: 0, years: 20, published: 90 },
  { stockPct: 0, years: 25, published: 46 },
  { stockPct: 0, years: 30, published: 20 },
];

const window = { firstStartYear: 1926, lastEndYear: 1995 } as const;

describe('the 4% rule over 30-year payouts, 1926-1966 through 1966-1995 (Table 3)', () => {
  it.each(TABLE_3_FOUR_PERCENT.filter((r) => r.years === 30))(
    '$stockPct stocks matches $published% within 2 points',
    ({ stockPct, published }) => {
      const r = historicalSuccessRate({ withdrawalRate: 0.04, stockPct, years: 30, ...window });
      expect(r.periods).toBe(41); // the study's count of overlapping 30-year periods
      expect(Math.abs(r.rate * 100 - published)).toBeLessThanOrEqual(2);
    },
  );
});

describe('the rest of Table 3 at 4%', () => {
  // Our stock series is the CRSP value-weighted market; the study used Ibbotson's S&P 500.
  // That swaps the outcome of a single cohort in two shorter-horizon cells
  // (1929 start, 100% stocks, 25 years; 1965 start, 100% bonds, 20 years). Each is one period off.
  it.each(TABLE_3_FOUR_PERCENT.filter((r) => r.years !== 30))(
    '$stockPct stocks over $years years is within one period of $published%',
    ({ stockPct, years, published }) => {
      const r = historicalSuccessRate({ withdrawalRate: 0.04, stockPct, years, ...window });
      const publishedCount = Math.round((published / 100) * r.periods);
      expect(Math.abs(r.successes - publishedCount)).toBeLessThanOrEqual(1);
    },
  );
});

describe('the full Table 3 grid (3% to 12%, 15 to 30 years, 5 allocations)', () => {
  it('has mean absolute error under 1 point', () => {
    let total = 0;
    let cells = 0;
    for (const [stockPct, rows] of Object.entries(TABLE_3)) {
      for (const [years, row] of Object.entries(rows)) {
        row.forEach((published, i) => {
          const r = historicalSuccessRate({
            withdrawalRate: (i + 3) / 100, stockPct: Number(stockPct), years: Number(years), ...window,
          });
          total += Math.abs(r.rate * 100 - published);
          cells++;
        });
      }
    }
    expect(cells).toBe(200);
    expect(total / cells).toBeLessThan(1);
  });
});

// Cooley, Hubbard & Walz (1998), Table 3, rows by withdrawal rate 3%..12%.
const TABLE_3: Record<string, Record<string, number[]>> = {
  '1': { 15: [100, 100, 100, 91, 79, 70, 63, 55, 43, 34], 20: [100, 100, 88, 75, 63, 53, 43, 33, 29, 24], 25: [100, 100, 87, 70, 59, 46, 35, 30, 26, 20], 30: [100, 95, 85, 68, 59, 41, 34, 34, 27, 15] },
  '0.75': { 15: [100, 100, 100, 95, 82, 68, 64, 46, 36, 27], 20: [100, 100, 90, 75, 61, 51, 37, 27, 20, 12], 25: [100, 100, 85, 65, 50, 37, 30, 22, 7, 2], 30: [100, 98, 83, 68, 49, 34, 22, 7, 2, 0] },
  '0.5': { 15: [100, 100, 100, 93, 79, 64, 50, 32, 23, 13], 20: [100, 100, 90, 75, 55, 33, 22, 10, 0, 0], 25: [100, 100, 80, 57, 37, 20, 7, 0, 0, 0], 30: [100, 95, 76, 51, 17, 5, 0, 0, 0, 0] },
  '0.25': { 15: [100, 100, 100, 89, 70, 50, 32, 18, 13, 7], 20: [100, 100, 82, 47, 31, 16, 8, 4, 0, 0], 25: [100, 93, 48, 24, 15, 4, 2, 0, 0, 0], 30: [100, 71, 27, 20, 5, 0, 0, 0, 0, 0] },
  '0': { 15: [100, 100, 100, 71, 39, 21, 18, 16, 14, 9], 20: [100, 90, 47, 20, 14, 12, 10, 2, 0, 0], 25: [100, 46, 17, 15, 11, 2, 0, 0, 0, 0], 30: [80, 20, 17, 12, 0, 0, 0, 0, 0, 0] },
};
