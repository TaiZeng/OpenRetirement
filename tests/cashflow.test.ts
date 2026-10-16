import { describe, expect, it } from 'vitest';
import { cashFlowSankey, cashFlowRows } from '../src/engine/cashflow';
import { constantMarkets, horizonYears, projectPlan } from '../src/engine/projection';
import { samplePlan } from '../src/engine/samplePlan';

const plan = samplePlan();
const result = projectPlan(plan, constantMarkets(plan.assumptions, horizonYears(plan)));

describe('cash flow Sankey', () => {
  it.each(result.years.filter((_, i) => i % 7 === 0).map((y) => [y.year, y] as const))(
    'balances sources and uses in %i',
    (_year, y) => {
      const s = cashFlowSankey(y);
      const hub = s.nodes.findIndex((n) => n.name === 'Cash flow');
      const into = s.links.filter((l) => l.target === hub).reduce((a, l) => a + l.value, 0);
      const out = s.links.filter((l) => l.source === hub).reduce((a, l) => a + l.value, 0);
      expect(into).toBeCloseTo(out, 0);
      expect(s.links.every((l) => l.value > 0)).toBe(true);
    },
  );

  it('shows wages during working years and withdrawals in retirement', () => {
    const working = cashFlowSankey(result.years[0]).nodes.map((n) => n.name);
    expect(working).toContain('Wages');
    const retiredYear = result.years.find((y) => y.ages.p1 === 62)!;
    const retired = cashFlowSankey(retiredYear).nodes.map((n) => n.name);
    expect(retired).not.toContain('Wages');
    expect(retired.some((n) => n.startsWith('Withdrawal'))).toBe(true);
  });
});

describe('cash flow rows', () => {
  it('reports one row per year in today’s dollars', () => {
    const rows = cashFlowRows(result);
    expect(rows).toHaveLength(result.years.length);
    expect(rows[0].wages).toBeCloseTo(result.years[0].income.wages / result.years[0].priceIndex, 6);
  });
});
