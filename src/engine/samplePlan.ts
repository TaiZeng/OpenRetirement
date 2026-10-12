import type { Plan } from './types';

/** Synthetic household used for the demo, tests, and the e2e check. Not real data. */
export function samplePlan(): Plan {
  return {
    startYear: 2026,
    people: {
      p1: { name: 'Alex', birthYear: 1981, endAge: 95, retirementAge: 60, salary: 150_000, ssPia: 3_200, ssClaimAge: 67 },
      p2: { name: 'Sam', birthYear: 1983, endAge: 95, retirementAge: 58, salary: 90_000, ssPia: 2_200, ssClaimAge: 67 },
    },
    accounts: [
      { id: 'a1', name: "Alex's 401(k)", type: 'traditional', owner: 'p1', balance: 600_000, costBasis: 0, contribution: 24_500 },
      { id: 'a2', name: "Sam's 401(k)", type: 'traditional', owner: 'p2', balance: 250_000, costBasis: 0, contribution: 15_000 },
      { id: 'a3', name: "Alex's Roth IRA", type: 'roth', owner: 'p1', balance: 90_000, costBasis: 0, contribution: 7_500 },
      { id: 'a4', name: "Sam's Roth IRA", type: 'roth', owner: 'p2', balance: 60_000, costBasis: 0, contribution: 7_500 },
      { id: 'a5', name: "Alex's brokerage", type: 'taxable', owner: 'p1', balance: 120_000, costBasis: 80_000, contribution: 0 },
      { id: 'a6', name: 'Joint brokerage', type: 'taxable', owner: 'joint', balance: 200_000, costBasis: 150_000, contribution: 10_000 },
      { id: 'a7', name: 'Family HSA', type: 'hsa', owner: 'p1', balance: 40_000, costBasis: 0, contribution: 8_750 },
      { id: 'a8', name: 'Emergency fund', type: 'cash', owner: 'joint', balance: 50_000, costBasis: 50_000, contribution: 0 },
    ],
    preRetirementSpending: 100_000,
    retirementSpending: 110_000,
    survivorSpendingPct: 0.7,
    assumptions: {
      stockReturn: 0.07,
      bondReturn: 0.045,
      cashReturn: 0.03,
      inflation: 0.025,
      stockVolatility: 0.16,
      bondVolatility: 0.06,
      stockPct: 0.6,
      bondPct: 0.35,
      stateTaxRate: 0.05,
      stateTaxesSocialSecurity: false,
      heirTaxRate: 0.24,
    },
    strategy: { rothConversion: 0, rothConversionStopAge: 73 },
  };
}
