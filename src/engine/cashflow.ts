import type { AccountType, ProjectionResult, YearResult } from './types';

export interface SankeyData {
  nodes: { name: string }[];
  links: { source: number; target: number; value: number }[];
}

const WITHDRAWAL_LABEL: Record<AccountType, string> = {
  cash: 'Withdrawal: cash',
  taxable: 'Withdrawal: taxable',
  traditional: 'Withdrawal: traditional',
  roth: 'Withdrawal: Roth',
  hsa: 'Withdrawal: HSA',
};

/**
 * One year's cash flow as a Sankey: income sources flow into a hub, the hub flows out to
 * spending, taxes, contributions and savings. A shortfall appears as a source so both sides balance.
 */
export function cashFlowSankey(y: YearResult): SankeyData {
  const totalContrib = Object.values(y.contributions).reduce((a, b) => a + b, 0);
  const sources: [string, number][] = [
    ['Wages', y.income.wages],
    ['Social Security', y.income.socialSecurity],
    ['RMDs', y.income.rmd],
    ...(Object.keys(WITHDRAWAL_LABEL) as AccountType[]).map((t): [string, number] => [WITHDRAWAL_LABEL[t], y.withdrawals[t]]),
    ['Shortfall', y.shortfall],
  ];
  const uses: [string, number][] = [
    ['Spending', y.spending],
    ['Taxes', y.taxes.total],
    ['Contributions', totalContrib],
    ['Saved to taxable', y.savedSurplus],
  ];
  const nodes: { name: string }[] = [{ name: 'Cash flow' }];
  const links: SankeyData['links'] = [];
  const MIN = 0.5;
  for (const [name, value] of sources) {
    if (value < MIN) continue;
    nodes.push({ name });
    links.push({ source: nodes.length - 1, target: 0, value });
  }
  for (const [name, value] of uses) {
    if (value < MIN) continue;
    nodes.push({ name });
    links.push({ source: 0, target: nodes.length - 1, value });
  }
  return { nodes, links };
}

export interface CashFlowRow {
  year: number;
  wages: number;
  socialSecurity: number;
  rmd: number;
  withdrawals: number;
  spending: number;
  taxes: number;
  contributions: number;
  saved: number;
  rothConversion: number;
}

/** Per-year cash flow in today's dollars for the stacked chart. */
export function cashFlowRows(r: ProjectionResult): CashFlowRow[] {
  return r.years.map((y) => {
    const k = 1 / y.priceIndex;
    return {
      year: y.year,
      wages: y.income.wages * k,
      socialSecurity: y.income.socialSecurity * k,
      rmd: y.income.rmd * k,
      withdrawals: Object.values(y.withdrawals).reduce((a, b) => a + b, 0) * k,
      spending: y.spending * k,
      taxes: y.taxes.total * k,
      contributions: Object.values(y.contributions).reduce((a, b) => a + b, 0) * k,
      saved: y.savedSurplus * k,
      rothConversion: y.rothConversion * k,
    };
  });
}
