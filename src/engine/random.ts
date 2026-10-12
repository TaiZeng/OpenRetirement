import type { MarketYear } from './types';

/** Mulberry32: small, fast, seedable 32-bit PRNG returning floats in [0, 1). Public domain. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller. */
export function normal(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export interface ReturnModel {
  stockReturn: number;
  stockVolatility: number;
  bondReturn: number;
  bondVolatility: number;
  cashReturn: number;
  inflation: number;
}

/**
 * Independent normal annual returns with the given arithmetic means and volatilities.
 * Inflation and cash are held at their expected values.
 */
export function simulatedReturns(rng: () => number, years: number, m: ReturnModel): MarketYear[] {
  return Array.from({ length: years }, () => ({
    stocks: Math.max(-0.99, m.stockReturn + m.stockVolatility * normal(rng)),
    bonds: Math.max(-0.99, m.bondReturn + m.bondVolatility * normal(rng)),
    cash: m.cashReturn,
    inflation: m.inflation,
  }));
}
