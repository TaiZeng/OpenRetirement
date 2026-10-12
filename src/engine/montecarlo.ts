import { horizonYears, projectPlan } from './projection';
import { mulberry32, simulatedReturns } from './random';
import { FIRST_DATA_YEAR, LAST_DATA_YEAR, marketYear } from './replay';
import type { MarketYear, Plan, ProjectionResult } from './types';

export type SimulationMode = 'historical' | 'simulated';

export interface SimulationOptions {
  mode: SimulationMode;
  /** Simulated mode only. */
  trials?: number;
  seed?: number;
}

export interface Band {
  p10: number[];
  p50: number[];
  p90: number[];
}

export interface SimulationResult {
  mode: SimulationMode;
  trials: number;
  successRate: number;
  years: number[];
  /** Net worth bands in today's dollars. */
  percentiles: { netWorth: Band };
  /** Success rate by historical start year (historical mode only). */
  cohorts: { startYear: number; success: boolean }[];
  medianEstateAfterTax: number;
}

/**
 * Historical sequences as in cFIREsim: one trial per start year. When the plan horizon runs past
 * the last data year, the sequence wraps to the first data year so every start year is usable.
 */
function historicalPaths(years: number): { startYear: number; markets: MarketYear[] }[] {
  const span = LAST_DATA_YEAR - FIRST_DATA_YEAR + 1;
  return Array.from({ length: span }, (_, k) => ({
    startYear: FIRST_DATA_YEAR + k,
    markets: Array.from({ length: years }, (_, i) => marketYear(FIRST_DATA_YEAR + ((k + i) % span))),
  }));
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function runMonteCarlo(plan: Plan, opts: SimulationOptions): SimulationResult {
  const horizon = horizonYears(plan);
  let runs: { startYear: number; result: ProjectionResult }[];
  if (opts.mode === 'historical') {
    runs = historicalPaths(horizon).map((p) => ({ startYear: p.startYear, result: projectPlan(plan, p.markets) }));
  } else {
    const rng = mulberry32(opts.seed ?? 1);
    const trials = opts.trials ?? 1000;
    runs = Array.from({ length: trials }, () => ({
      startYear: 0,
      result: projectPlan(plan, simulatedReturns(rng, horizon, plan.assumptions)),
    }));
  }

  const years = runs[0].result.years.map((y) => y.year);
  const netWorth: Band = { p10: [], p50: [], p90: [] };
  for (let i = 0; i < horizon; i++) {
    const real = runs.map((r) => r.result.years[i].netWorth / r.result.years[i].priceIndex).sort((x, y) => x - y);
    netWorth.p10.push(quantile(real, 0.1));
    netWorth.p50.push(quantile(real, 0.5));
    netWorth.p90.push(quantile(real, 0.9));
  }
  const estates = runs
    .map((r) => r.result.estate.heirsAfterTax / r.result.years[horizon - 1].priceIndex)
    .sort((x, y) => x - y);

  return {
    mode: opts.mode,
    trials: runs.length,
    successRate: runs.filter((r) => r.result.success).length / runs.length,
    years,
    percentiles: { netWorth },
    cohorts: opts.mode === 'historical' ? runs.map((r) => ({ startYear: r.startYear, success: r.result.success })) : [],
    medianEstateAfterTax: quantile(estates, 0.5),
  };
}
