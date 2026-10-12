import { describe, expect, it } from 'vitest';
import { applyLevers, coordinateSearch, optimizePlan, spendingForWithdrawalRate } from '../src/engine/optimizer';
import { constantMarkets, horizonYears, projectPlan } from '../src/engine/projection';
import { samplePlan } from '../src/engine/samplePlan';

describe('coordinate search', () => {
  it('finds the maximum of a separable objective on a grid', () => {
    const grids = { x: [0, 1, 2, 3, 4], y: [10, 20, 30] };
    const f = (p: { x: number; y: number }) => -((p.x - 3) ** 2) - (p.y - 20) ** 2 / 100;
    const r = coordinateSearch(grids, { x: 0, y: 10 }, f);
    expect(r.best).toEqual({ x: 3, y: 20 });
    expect(r.evaluations).toBeLessThan(5 * 3 * 3);
  });

  it('caches repeated points', () => {
    let calls = 0;
    coordinateSearch({ x: [0, 1, 2] }, { x: 0 }, (p) => {
      calls++;
      return p.x;
    });
    expect(calls).toBe(3);
  });
});

describe('levers', () => {
  it('sets retirement spending from a withdrawal rate on the portfolio at retirement', () => {
    const plan = samplePlan();
    const spend = spendingForWithdrawalRate(plan, 0.04);
    const r = projectPlan(plan, constantMarkets(plan.assumptions, horizonYears(plan)));
    const lastWorkYear = r.years.find((y) => y.ages.p1 === plan.people.p1.retirementAge - 1)!;
    expect(spend).toBeCloseTo(0.04 * (lastWorkYear.netWorth / lastWorkYear.priceIndex), 6);
  });

  it('applies retirement age, claiming age and conversions to both spouses', () => {
    const plan = applyLevers(samplePlan(), { retirementAge: 62, ssClaimAge: 70, rothConversion: 50_000, withdrawalRate: null });
    expect(plan.people.p1.retirementAge).toBe(62);
    expect(plan.people.p2.retirementAge).toBe(62 - (1983 - 1981));
    expect(plan.people.p1.ssClaimAge).toBe(70);
    expect(plan.people.p2.ssClaimAge).toBe(70);
    expect(plan.strategy.rothConversion).toBe(50_000);
  });
});

describe('optimizePlan', () => {
  const plan = samplePlan();
  const opts = {
    objective: 'estate' as const,
    minSuccess: 0.9,
    levers: {
      retirementAge: [58, 60, 62],
      ssClaimAge: [62, 67, 70],
      rothConversion: [0, 50_000, 100_000],
      withdrawalRate: [null],
    },
  };

  it('never returns a worse score than the current plan', () => {
    const r = optimizePlan(plan, opts);
    expect(r.bestScore).toBeGreaterThanOrEqual(r.baselineScore);
    expect(r.best.successRate).toBeGreaterThanOrEqual(0.9);
  });

  it('is deterministic', () => {
    expect(optimizePlan(plan, opts)).toEqual(optimizePlan(plan, opts));
  });

  it('maximizing success prefers retiring later over earlier', () => {
    const tight = { ...plan, retirementSpending: 180_000 };
    const r = optimizePlan(tight, {
      objective: 'success',
      minSuccess: 0,
      levers: { retirementAge: [55, 65], ssClaimAge: [67], rothConversion: [0], withdrawalRate: [null] },
    });
    expect(r.best.levers.retirementAge).toBe(65);
  });
});
