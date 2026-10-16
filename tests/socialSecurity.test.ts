// Reference factors from SSA "Benefit reduction for early retirement" and
// "Delayed retirement credits" (ssa.gov/benefits/retirement/planner/agereduction.html, delayret.html).
import { describe, expect, it } from 'vitest';
import { claimingFactor, fullRetirementAgeMonths } from '../src/engine/socialSecurity';

describe('full retirement age', () => {
  it('is 67 for 1960 and later, 66 for 1943-1954, graduated in between', () => {
    expect(fullRetirementAgeMonths(1960)).toBe(67 * 12);
    expect(fullRetirementAgeMonths(1950)).toBe(66 * 12);
    expect(fullRetirementAgeMonths(1957)).toBe(66 * 12 + 6);
  });
});

describe('claiming factor', () => {
  it('pays 70% at 62 and 124% at 70 for FRA 67 (SSA published)', () => {
    expect(claimingFactor(62, 1960)).toBeCloseTo(0.7, 10);
    expect(claimingFactor(67, 1960)).toBe(1);
    expect(claimingFactor(70, 1960)).toBeCloseTo(1.24, 10);
  });
  it('pays 75% at 62 and 132% at 70 for FRA 66', () => {
    expect(claimingFactor(62, 1950)).toBeCloseTo(0.75, 10);
    expect(claimingFactor(70, 1950)).toBeCloseTo(1.32, 10);
  });
  it('caps delayed credits at 70', () => {
    expect(claimingFactor(72, 1960)).toBeCloseTo(1.24, 10);
  });
});
