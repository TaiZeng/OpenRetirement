import { describe, expect, it } from 'vitest';
import { constantMarkets, horizonYears, projectPlan } from '../src/engine/projection';
import { ordinaryIncomeTax } from '../src/engine/tax';
import { samplePlan } from '../src/engine/samplePlan';
import type { Account, Plan } from '../src/engine/types';

const flat = { stocks: 0, bonds: 0, cash: 0, inflation: 0 };

function retiredCouple(accounts: Account[], overrides: Partial<Plan> = {}): Plan {
  const base = samplePlan();
  return {
    ...base,
    people: {
      p1: { ...base.people.p1, birthYear: 1964, retirementAge: 50, ssPia: 0, endAge: 90 },
      p2: { ...base.people.p2, birthYear: 1964, retirementAge: 50, ssPia: 0, endAge: 90 },
    },
    accounts,
    retirementSpending: 50_000,
    preRetirementSpending: 50_000,
    assumptions: { ...base.assumptions, stateTaxRate: 0 },
    strategy: { rothConversion: 0, rothConversionStopAge: 73 },
    ...overrides,
  };
}

const acct = (a: Partial<Account> & Pick<Account, 'type' | 'balance'>): Account => ({
  id: a.type + a.balance + (a.owner ?? 'p1'), name: a.type, owner: 'p1', costBasis: 0, contribution: 0, ...a,
});

describe('deterministic projection', () => {
  it('spans from the start year until the last survivor reaches end age', () => {
    const plan = samplePlan();
    expect(horizonYears(plan)).toBe(1983 + 95 - 2026 + 1);
    const r = projectPlan(plan, constantMarkets(plan.assumptions, horizonYears(plan)));
    expect(r.years[0].year).toBe(2026);
    expect(r.years.at(-1)!.year).toBe(1983 + 95);
  });

  it('draws Roth money tax free and conserves dollars with zero returns', () => {
    const plan = retiredCouple([acct({ type: 'roth', balance: 1_000_000 })]);
    const r = projectPlan(plan, Array(40).fill(flat));
    expect(r.years[0].withdrawals.roth).toBeCloseTo(50_000, 2);
    expect(r.years[0].taxes.total).toBeCloseTo(0, 6);
    expect(r.years[0].netWorth).toBeCloseTo(950_000, 2);
  });

  it('grosses up traditional withdrawals so after-tax cash covers spending', () => {
    const plan = retiredCouple([acct({ type: 'traditional', balance: 2_000_000 })]);
    const y = projectPlan(plan, Array(40).fill(flat)).years[0];
    const w = y.withdrawals.traditional;
    // Age 62: no early-withdrawal penalty. Tax = ordinary tax on (W - standard deduction).
    expect(w - ordinaryIncomeTax(w - 32_200, 'mfj', 1)).toBeCloseTo(50_000, 0);
    expect(y.taxes.total).toBeCloseTo(w - 50_000, 0);
  });

  it('withdraws cash, then taxable, then traditional, then Roth', () => {
    const plan = retiredCouple([
      acct({ type: 'roth', balance: 500_000 }),
      acct({ type: 'traditional', balance: 500_000 }),
      acct({ type: 'taxable', balance: 30_000, costBasis: 30_000 }),
      acct({ type: 'cash', balance: 10_000, costBasis: 10_000, owner: 'joint' }),
    ]);
    const y = projectPlan(plan, Array(40).fill(flat)).years[0];
    expect(y.withdrawals.cash).toBeCloseTo(10_000, 2);
    expect(y.withdrawals.taxable).toBeCloseTo(30_000, 2);
    expect(y.withdrawals.traditional).toBeGreaterThan(10_000);
    expect(y.withdrawals.roth).toBe(0);
  });

  it('taxes only the gain portion of taxable withdrawals, at LTCG rates', () => {
    const plan = retiredCouple([acct({ type: 'taxable', balance: 1_000_000, costBasis: 500_000 })]);
    const y = projectPlan(plan, Array(40).fill(flat)).years[0];
    // 25,000 gain is inside the 0% LTCG band, and the standard deduction covers it anyway.
    expect(y.taxes.total).toBeCloseTo(0, 6);
    expect(y.taxes.agi).toBeCloseTo(25_000, 2);
  });

  it('takes the Uniform Lifetime RMD on the prior year-end balance', () => {
    const base = retiredCouple([acct({ type: 'traditional', balance: 1_000_000 })]);
    const plan: Plan = {
      ...base,
      people: { p1: { ...base.people.p1, birthYear: 1951 }, p2: { ...base.people.p2, birthYear: 1951 } },
      retirementSpending: 0,
    };
    const y = projectPlan(plan, Array(40).fill(flat)).years[0];
    expect(y.ages.p1).toBe(75);
    expect(y.income.rmd).toBeCloseTo(1_000_000 / 24.6, 2);
    // The RMD exceeds spending, so the after-tax remainder is reinvested in a taxable account.
    expect(y.savedSurplus).toBeCloseTo(y.income.rmd - y.taxes.total, 2);
  });

  it('pays Social Security adjusted for claiming age', () => {
    const base = retiredCouple([acct({ type: 'roth', balance: 1_000_000 })]);
    const plan: Plan = {
      ...base,
      startYear: 2034,
      people: {
        p1: { ...base.people.p1, ssPia: 2_000, ssClaimAge: 70 },
        p2: { ...base.people.p2, ssPia: 0 },
      },
    };
    const y = projectPlan(plan, Array(40).fill(flat)).years[0];
    expect(y.ages.p1).toBe(70);
    expect(y.income.socialSecurity).toBeCloseTo(2_000 * 12 * 1.24, 2);
  });

  it('steps up basis of the deceased spouse’s taxable account and moves it to the survivor', () => {
    const base = retiredCouple([acct({ type: 'taxable', balance: 1_000_000, costBasis: 100_000 })]);
    const plan: Plan = { ...base, people: { ...base.people, p1: { ...base.people.p1, endAge: 62 } } };
    const r = projectPlan(plan, Array(40).fill(flat));
    const afterDeath = r.years.find((y) => !y.alive.p1)!;
    // Basis equals value after step-up, so withdrawals realize no gain.
    expect(afterDeath.taxes.agi).toBeCloseTo(0, 6);
    expect(afterDeath.spending).toBeCloseTo(50_000 * 0.7, 2);
  });

  it('spends real dollars that grow with inflation', () => {
    const plan = retiredCouple([acct({ type: 'roth', balance: 1_000_000 })]);
    const r = projectPlan(plan, Array(40).fill({ ...flat, inflation: 0.03 }));
    expect(r.years[0].spending).toBeCloseTo(50_000 * 1.03, 2);
    expect(r.years[1].spending).toBeCloseTo(50_000 * 1.03 ** 2, 2);
  });

  it('reports failure when money runs out', () => {
    const plan = retiredCouple([acct({ type: 'roth', balance: 120_000 })]);
    const r = projectPlan(plan, Array(40).fill(flat));
    expect(r.success).toBe(false);
    expect(r.failureYear).toBe(2028);
    expect(r.years[2].shortfall).toBeCloseTo(30_000, 2);
  });

  it('converts traditional to Roth and pays the tax', () => {
    const plan = retiredCouple(
      [acct({ type: 'traditional', balance: 1_000_000 }), acct({ type: 'cash', balance: 500_000, costBasis: 500_000 })],
      { strategy: { rothConversion: 100_000, rothConversionStopAge: 73 } },
    );
    const y = projectPlan(plan, Array(40).fill(flat)).years[0];
    expect(y.rothConversion).toBeCloseTo(100_000, 2);
    expect(y.balances.roth).toBeCloseTo(100_000, 2);
    expect(y.taxes.federalOrdinary).toBeCloseTo(ordinaryIncomeTax(100_000 - 32_200, 'mfj', 1), 2);
  });

  it('saves surplus income during working years', () => {
    const plan = samplePlan();
    const y = projectPlan(plan, constantMarkets(plan.assumptions, horizonYears(plan))).years[0];
    expect(y.income.wages).toBeCloseTo(240_000 * 1.025, 2);
    expect(y.savedSurplus).toBeGreaterThan(0);
    expect(y.shortfall).toBe(0);
  });
});

describe('estate at death', () => {
  const lastAlive = (endAge: number) => ({ endAge });
  it('passes Roth whole and traditional net of the heirs’ tax rate', () => {
    const base = retiredCouple([
      acct({ type: 'roth', balance: 1_000_000, owner: 'p1' }),
      acct({ type: 'traditional', balance: 1_000_000, owner: 'p2' }),
    ]);
    const plan: Plan = {
      ...base,
      retirementSpending: 0,
      people: { p1: { ...base.people.p1, ...lastAlive(62) }, p2: { ...base.people.p2, ...lastAlive(62) } },
    };
    const r = projectPlan(plan, Array(40).fill(flat));
    expect(r.estate.gross).toBeCloseTo(2_000_000, 2);
    expect(r.estate.heirsByType.roth).toBeCloseTo(1_000_000, 2);
    expect(r.estate.heirsByType.traditional).toBeCloseTo(760_000, 2);
    expect(r.estate.federalEstateTax).toBe(0);
  });

  it('charges 40% federal estate tax above twice the exclusion (portability)', () => {
    const base = retiredCouple([acct({ type: 'cash', balance: 40_000_000, costBasis: 40_000_000, owner: 'joint' })]);
    const plan: Plan = {
      ...base,
      retirementSpending: 0,
      people: { p1: { ...base.people.p1, endAge: 62 }, p2: { ...base.people.p2, endAge: 62 } },
    };
    const r = projectPlan(plan, Array(40).fill(flat));
    expect(r.estate.federalEstateTax).toBeCloseTo(0.4 * (40_000_000 - 30_000_000), 2);
  });
});
