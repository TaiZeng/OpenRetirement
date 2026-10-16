export type PersonId = 'p1' | 'p2';
export type FilingStatus = 'mfj' | 'single';

export interface Person {
  name: string;
  birthYear: number;
  /** Age at which this person is assumed to die (last year alive). */
  endAge: number;
  retirementAge: number;
  /** Gross wages, today's dollars per year. */
  salary: number;
  /** Social Security primary insurance amount at full retirement age, today's dollars per month. */
  ssPia: number;
  ssClaimAge: number;
}

export type AccountType = 'traditional' | 'roth' | 'taxable' | 'hsa' | 'cash';
/** 'joint' is valid only for taxable and cash accounts. */
export type Owner = PersonId | 'joint';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  owner: Owner;
  balance: number;
  /** Cost basis for taxable accounts. Ignored for other types. */
  costBasis: number;
  /** Annual contribution in today's dollars while the owner works. */
  contribution: number;
}

export interface Assumptions {
  /** Nominal expected annual returns and inflation, used by the deterministic projection and simulated Monte Carlo. */
  stockReturn: number;
  bondReturn: number;
  cashReturn: number;
  inflation: number;
  stockVolatility: number;
  bondVolatility: number;
  /** Portfolio mix for invested accounts (traditional, roth, taxable, hsa). Remainder after stocks and bonds is cash. */
  stockPct: number;
  bondPct: number;
  /** Flat state income tax rate on AGI. */
  stateTaxRate: number;
  stateTaxesSocialSecurity: boolean;
  /** Heirs' marginal ordinary rate applied to inherited pre-tax money. */
  heirTaxRate: number;
}

export interface Strategy {
  /** Annual Roth conversion, today's dollars, from household retirement until the stop age of person 1. */
  rothConversion: number;
  rothConversionStopAge: number;
}

export interface Plan {
  startYear: number;
  people: { p1: Person; p2: Person };
  accounts: Account[];
  /** Household spending, today's dollars per year, while either person works. */
  preRetirementSpending: number;
  /** Household spending, today's dollars per year, once both are retired. */
  retirementSpending: number;
  /** Spending multiplier after the first death. */
  survivorSpendingPct: number;
  assumptions: Assumptions;
  strategy: Strategy;
}

/** One year of market outcomes. Nominal fractions. */
export interface MarketYear {
  stocks: number;
  bonds: number;
  cash: number;
  inflation: number;
}

export interface Balances {
  traditional: number;
  roth: number;
  taxable: number;
  hsa: number;
  cash: number;
}

export interface TaxBreakdown {
  federalOrdinary: number;
  federalLtcg: number;
  niit: number;
  payroll: number;
  state: number;
  irmaa: number;
  /** 10% additional tax on early traditional withdrawals. */
  penalty: number;
  total: number;
  agi: number;
  taxableIncome: number;
}

export interface YearResult {
  year: number;
  ages: { p1: number; p2: number };
  alive: { p1: boolean; p2: boolean };
  /** Cumulative price index relative to the plan start (1 at start). */
  priceIndex: number;
  income: { wages: number; socialSecurity: number; rmd: number; interest: number };
  withdrawals: Balances;
  rothConversion: number;
  contributions: Balances;
  /** Surplus cash flow saved to the taxable account. */
  savedSurplus: number;
  spending: number;
  taxes: TaxBreakdown;
  shortfall: number;
  /** End-of-year balances, nominal. */
  balances: Balances;
  netWorth: number;
}

export interface Estate {
  year: number;
  gross: number;
  federalEstateTax: number;
  heirsAfterTax: number;
  byType: Balances;
  heirsByType: Balances;
}

export interface ProjectionResult {
  years: YearResult[];
  success: boolean;
  /** First calendar year with unfunded spending, if any. */
  failureYear: number | null;
  estate: Estate;
}
