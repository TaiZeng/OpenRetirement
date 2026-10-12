import { describe, expect, it } from 'vitest';
import { mulberry32, simulatedReturns } from '../../src/engine/random';
import { runMonteCarlo } from '../../src/engine/montecarlo';
import { samplePlan } from '../../src/engine/samplePlan';

describe('seeded random streams', () => {
  it('mulberry32 is reproducible and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });

  it('simulated returns hit the configured mean and volatility in large samples', () => {
    const rng = mulberry32(7);
    const xs = simulatedReturns(rng, 100_000, {
      stockReturn: 0.07, stockVolatility: 0.16, bondReturn: 0.04, bondVolatility: 0.06, cashReturn: 0.03, inflation: 0.025,
    }).map((m) => m.stocks);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(mean).toBeCloseTo(0.07, 2);
    expect(sd).toBeCloseTo(0.16, 2);
  });
});

describe('Monte Carlo golden: fixed seed is reproducible', () => {
  it('returns identical results for the same seed', () => {
    const a = runMonteCarlo(samplePlan(), { mode: 'simulated', trials: 300, seed: 12345 });
    const b = runMonteCarlo(samplePlan(), { mode: 'simulated', trials: 300, seed: 12345 });
    expect(a).toEqual(b);
  });

  it('differs for a different seed', () => {
    const a = runMonteCarlo(samplePlan(), { mode: 'simulated', trials: 300, seed: 12345 });
    const b = runMonteCarlo(samplePlan(), { mode: 'simulated', trials: 300, seed: 54321 });
    expect(a.percentiles.netWorth.p50).not.toEqual(b.percentiles.netWorth.p50);
  });

  it('matches the recorded snapshot for seed 12345', () => {
    const r = runMonteCarlo(samplePlan(), { mode: 'simulated', trials: 300, seed: 12345 });
    expect({
      successRate: r.successRate,
      medianFinal: Math.round(r.percentiles.netWorth.p50.at(-1)!),
    }).toMatchSnapshot();
  });

  it('historical mode replays every available start year', () => {
    const r = runMonteCarlo(samplePlan(), { mode: 'historical' });
    expect(r.trials).toBeGreaterThan(0);
    expect(r.successRate).toBeGreaterThanOrEqual(0);
    expect(r.successRate).toBeLessThanOrEqual(1);
  });
});
