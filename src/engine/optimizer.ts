import { runMonteCarlo, type SimulationOptions } from './montecarlo';
import { constantMarkets, horizonYears, projectPlan } from './projection';
import type { Plan } from './types';

type Point = Record<string, number | null>;

/**
 * Coordinate search over discrete grids: sweep one lever at a time holding the others fixed,
 * keep the best value, and repeat until a full pass makes no improvement.
 */
export function coordinateSearch<P extends Point>(
  grids: { [K in keyof P]: P[K][] },
  start: P,
  score: (p: P) => number,
  maxPasses = 4,
): { best: P; bestScore: number; evaluations: number } {
  const cache = new Map<string, number>();
  const evaluate = (p: P) => {
    const key = JSON.stringify(p);
    let s = cache.get(key);
    if (s === undefined) {
      s = score(p);
      cache.set(key, s);
    }
    return s;
  };
  let best = { ...start };
  let bestScore = evaluate(best);
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (const key of Object.keys(grids) as (keyof P)[]) {
      for (const v of grids[key]) {
        const candidate = { ...best, [key]: v };
        const s = evaluate(candidate);
        if (s > bestScore + 1e-12) {
          best = candidate;
          bestScore = s;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { best, bestScore, evaluations: cache.size };
}

export interface Levers {
  /** Person 1's retirement age; person 2 retires in the same calendar year. */
  retirementAge: number;
  ssClaimAge: number;
  rothConversion: number;
  /** Initial withdrawal rate on the portfolio at retirement, or null to keep the plan's spending. */
  withdrawalRate: number | null;
}

/** Retirement spending (today's dollars) equal to `rate` times the real portfolio at retirement. */
export function spendingForWithdrawalRate(plan: Plan, rate: number): number {
  const r = projectPlan(plan, constantMarkets(plan.assumptions, horizonYears(plan)));
  const lastWorkYear = plan.people.p1.birthYear + plan.people.p1.retirementAge - 1;
  const y = r.years.find((x) => x.year === lastWorkYear) ?? r.years[0];
  return rate * (y.netWorth / y.priceIndex);
}

export function applyLevers(plan: Plan, l: Levers): Plan {
  const { p1, p2 } = plan.people;
  const retireYear = p1.birthYear + l.retirementAge;
  const next: Plan = {
    ...plan,
    people: {
      p1: { ...p1, retirementAge: l.retirementAge, ssClaimAge: l.ssClaimAge },
      p2: { ...p2, retirementAge: retireYear - p2.birthYear, ssClaimAge: l.ssClaimAge },
    },
    strategy: { ...plan.strategy, rothConversion: l.rothConversion },
  };
  if (l.withdrawalRate !== null) next.retirementSpending = spendingForWithdrawalRate(next, l.withdrawalRate);
  return next;
}

export interface OptimizeOptions {
  /** 'success' maximizes chance of success; 'estate' maximizes median after-tax estate subject to minSuccess. */
  objective: 'success' | 'estate';
  minSuccess: number;
  levers: { [K in keyof Levers]: Levers[K][] };
  simulation?: SimulationOptions;
}

export interface Evaluated {
  levers: Levers;
  successRate: number;
  medianEstate: number;
  retirementSpending: number;
}

export interface OptimizeResult {
  best: Evaluated;
  baseline: Evaluated;
  bestScore: number;
  baselineScore: number;
  evaluations: number;
}

function currentLevers(plan: Plan): Levers {
  return {
    retirementAge: plan.people.p1.retirementAge,
    ssClaimAge: plan.people.p1.ssClaimAge,
    rothConversion: plan.strategy.rothConversion,
    withdrawalRate: null,
  };
}

/** Coordinate search over the levers. Scores each candidate by historical replay unless told otherwise. */
export function optimizePlan(plan: Plan, opts: OptimizeOptions): OptimizeResult {
  const sim = opts.simulation ?? { mode: 'historical' as const };
  const evaluated = new Map<string, Evaluated>();
  const evaluate = (l: Levers): Evaluated => {
    const key = JSON.stringify(l);
    const hit = evaluated.get(key);
    if (hit) return hit;
    const candidate = applyLevers(plan, l);
    const r = runMonteCarlo(candidate, sim);
    const e = { levers: l, successRate: r.successRate, medianEstate: r.medianEstateAfterTax, retirementSpending: candidate.retirementSpending };
    evaluated.set(key, e);
    return e;
  };
  // Success objective: success first, estate as a tie-break. Estate objective: estate, but only
  // among plans meeting minSuccess; infeasible plans rank below every feasible one by success.
  const score = (e: Evaluated) =>
    opts.objective === 'success'
      ? e.successRate * 1e12 + e.medianEstate / 1e3
      : e.successRate + 1e-9 >= opts.minSuccess
        ? 1e12 + e.medianEstate
        : e.successRate;

  const baselineLevers = currentLevers(plan);
  const grids = Object.fromEntries(
    Object.entries(opts.levers).map(([k, values]) => {
      const current = baselineLevers[k as keyof Levers];
      return [k, values.includes(current as never) ? values : [current, ...values]];
    }),
  ) as OptimizeOptions['levers'];
  const search = coordinateSearch<Levers & Point>(grids as never, baselineLevers as Levers & Point, (l) => score(evaluate(l)));
  const baseline = evaluate(baselineLevers);
  const best = evaluate(search.best);
  return { best, baseline, bestScore: score(best), baselineScore: score(baseline), evaluations: search.evaluations };
}
