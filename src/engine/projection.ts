import { ESTATE_EXCLUSION, ESTATE_TAX_RATE, rmdStartAge, uniformLifetimeDivisor } from './constants';
import { claimingFactor } from './socialSecurity';
import {
  federalIncomeTax,
  irmaaAnnualSurcharge,
  niit,
  payrollTax,
  standardDeduction,
  taxableSocialSecurity,
} from './tax';
import type {
  AccountType,
  Assumptions,
  Balances,
  Estate,
  FilingStatus,
  MarketYear,
  Owner,
  PersonId,
  Plan,
  ProjectionResult,
  TaxBreakdown,
  YearResult,
} from './types';

const PEOPLE: PersonId[] = ['p1', 'p2'];
const EARLY_WITHDRAWAL_PENALTY = 0.1;
/** Age 59½ is approximated as the calendar year the owner turns 60. */
const PENALTY_FREE_AGE = 60;
const MEDICARE_AGE = 65;

interface LiveAccount {
  type: AccountType;
  owner: Owner;
  balance: number;
  basis: number;
  contribution: number;
}

const emptyBalances = (): Balances => ({ traditional: 0, roth: 0, taxable: 0, hsa: 0, cash: 0 });

/** Years from the plan start through the year the last survivor reaches end age. */
export function horizonYears(plan: Plan): number {
  const last = Math.max(...PEOPLE.map((id) => plan.people[id].birthYear + plan.people[id].endAge));
  return Math.max(1, last - plan.startYear + 1);
}

export function constantMarkets(a: Assumptions, years: number): MarketYear[] {
  return Array.from({ length: years }, () => ({
    stocks: a.stockReturn,
    bonds: a.bondReturn,
    cash: a.cashReturn,
    inflation: a.inflation,
  }));
}

function portfolioReturn(a: Assumptions, m: MarketYear): number {
  return a.stockPct * m.stocks + a.bondPct * m.bonds + Math.max(0, 1 - a.stockPct - a.bondPct) * m.cash;
}

function sumBy(accounts: LiveAccount[]): Balances {
  const b = emptyBalances();
  for (const a of accounts) b[a.type] += a.balance;
  return b;
}

/** A withdrawal source in priority order, with its tax character per dollar. */
interface Source {
  account: LiveAccount;
  type: AccountType;
  /** Fraction of each dollar that is ordinary income. */
  ordinary: number;
  /** Fraction of each dollar that is long-term gain. */
  gain: number;
  penalty: number;
}

/** Withdrawal order: cash, taxable, traditional (oldest owner first), Roth, then HSA. */
function withdrawalSources(accounts: LiveAccount[], ageOf: (o: Owner) => number): Source[] {
  const rank: Record<AccountType, number> = { cash: 0, taxable: 1, traditional: 2, roth: 3, hsa: 4 };
  return accounts
    .filter((a) => a.balance > 0)
    .sort((x, y) => rank[x.type] - rank[y.type] || ageOf(y.owner) - ageOf(x.owner))
    .map((account) => {
      const { type } = account;
      const gain = type === 'taxable' ? Math.max(0, 1 - account.basis / account.balance) : 0;
      const ordinary = type === 'traditional' ? 1 : 0;
      const penalty = type === 'traditional' && ageOf(account.owner) < PENALTY_FREE_AGE ? EARLY_WITHDRAWAL_PENALTY : 0;
      return { account, type, ordinary, gain, penalty };
    });
}

interface TaxInputs {
  status: FilingStatus;
  index: number;
  wagesByPerson: number[];
  pretaxContributions: number;
  socialSecurity: number;
  ordinaryOther: number; // RMDs, conversions, interest
  over65: number;
  medicareEnrollees: number;
  irmaaMagi: number | null;
  assumptions: Assumptions;
}

function computeTaxes(t: TaxInputs, extraOrdinary: number, gains: number, penaltyBase: number, interest: number): TaxBreakdown {
  const wages = t.wagesByPerson.reduce((a, b) => a + b, 0);
  const nonSs = Math.max(0, wages - t.pretaxContributions) + t.ordinaryOther + extraOrdinary;
  const taxableSs = taxableSocialSecurity(t.socialSecurity, nonSs + gains, t.status, t.index);
  const agi = nonSs + taxableSs + gains;
  const deduction = standardDeduction(t.status, t.over65, t.index);
  const ordinaryIncome = nonSs + taxableSs;
  const ordinaryTaxable = Math.max(0, ordinaryIncome - deduction);
  const ltcgTaxable = Math.max(0, gains - Math.max(0, deduction - ordinaryIncome));
  const fed = federalIncomeTax({ ordinaryTaxable, ltcg: ltcgTaxable, status: t.status, index: t.index });
  const niitTax = niit(agi, gains + interest, t.status);
  const payroll = payrollTax(t.wagesByPerson, t.status, t.index);
  const stateBase = t.assumptions.stateTaxesSocialSecurity ? agi : agi - taxableSs;
  const state = Math.max(0, stateBase) * t.assumptions.stateTaxRate;
  const irmaa = t.irmaaMagi === null ? 0 : irmaaAnnualSurcharge(t.irmaaMagi, t.status, t.index) * t.medicareEnrollees;
  const penalty = penaltyBase * EARLY_WITHDRAWAL_PENALTY;
  const total = fed.ordinary + fed.ltcg + niitTax + payroll + state + irmaa + penalty;
  return {
    federalOrdinary: fed.ordinary,
    federalLtcg: fed.ltcg,
    niit: niitTax,
    payroll,
    state,
    irmaa,
    penalty,
    total,
    agi,
    taxableIncome: ordinaryTaxable + ltcgTaxable,
  };
}

/** Walks sources in order and returns the tax character of withdrawing `gross` dollars. */
function drawPlan(sources: Source[], gross: number) {
  let left = gross;
  let ordinary = 0;
  let gains = 0;
  let penaltyBase = 0;
  const takes: number[] = [];
  for (const s of sources) {
    const take = Math.min(left, s.account.balance);
    takes.push(take);
    ordinary += take * s.ordinary;
    gains += take * s.gain;
    penaltyBase += take * (s.penalty > 0 ? 1 : 0);
    left -= take;
  }
  return { ordinary, gains, penaltyBase, takes };
}

/**
 * Projects a plan year by year over the given market path. All money is nominal; amounts entered
 * in today's dollars are scaled by the cumulative price index, which includes the current year's
 * inflation (Trinity-study convention: spending is indexed and paid at year end).
 */
export function projectPlan(plan: Plan, markets: MarketYear[]): ProjectionResult {
  const horizon = horizonYears(plan);
  if (markets.length < horizon) throw new RangeError(`need ${horizon} market years, got ${markets.length}`);
  const a = plan.assumptions;
  const accounts: LiveAccount[] = plan.accounts.map((x) => ({
    type: x.type,
    owner: x.owner,
    balance: x.balance,
    basis: x.type === 'taxable' ? Math.min(x.costBasis, x.balance) : x.type === 'cash' ? x.balance : 0,
    contribution: x.contribution,
  }));
  const years: YearResult[] = [];
  const magiHistory: number[] = [];
  let index = 1;
  let failureYear: number | null = null;
  const died = { p1: false, p2: false };

  for (let i = 0; i < horizon; i++) {
    const year = plan.startYear + i;
    const m = markets[i];
    index *= 1 + m.inflation;
    const ages = { p1: year - plan.people.p1.birthYear, p2: year - plan.people.p2.birthYear };
    const alive = { p1: ages.p1 <= plan.people.p1.endAge, p2: ages.p2 <= plan.people.p2.endAge };
    const living = PEOPLE.filter((id) => alive[id]);
    const ageOf = (o: Owner) => (o === 'joint' ? Math.max(...living.map((id) => ages[id])) : ages[o]);

    // Deaths at the start of the year: spousal rollover of retirement accounts, step-up in basis.
    for (const id of PEOPLE) {
      if (alive[id] || died[id]) continue;
      died[id] = true;
      const survivor = PEOPLE.find((p) => p !== id && alive[p]);
      for (const acc of accounts) {
        if (acc.owner === id) {
          if (acc.type === 'taxable') acc.basis = acc.balance;
          if (survivor) acc.owner = survivor;
          acc.contribution = 0;
        } else if (acc.owner === 'joint' && acc.type === 'taxable') {
          // Half of jointly owned property steps up at the first death (IRC 2040(b)).
          acc.basis = acc.basis / 2 + acc.balance / 2;
        }
      }
    }

    const status: FilingStatus = living.length === 2 ? 'mfj' : 'single';
    const working = living.filter((id) => ages[id] < plan.people[id].retirementAge);
    const allRetired = working.length === 0;

    // Required minimum distributions on prior year-end balances.
    const rmdByAccount = new Map<LiveAccount, number>();
    for (const acc of accounts) {
      if (acc.type !== 'traditional' || acc.owner === 'joint' || acc.balance <= 0) continue;
      const owner = plan.people[acc.owner];
      const age = ages[acc.owner];
      if (age >= rmdStartAge(owner.birthYear)) rmdByAccount.set(acc, acc.balance / uniformLifetimeDivisor(age));
    }

    // Growth.
    const r = portfolioReturn(a, m);
    let interest = 0;
    for (const acc of accounts) {
      if (acc.type === 'cash') {
        const earned = acc.balance * m.cash;
        interest += earned;
        acc.balance += earned;
        acc.basis += earned;
      } else {
        acc.balance *= 1 + r;
      }
    }

    // Income.
    const wagesByPerson = PEOPLE.map((id) => (alive[id] && ages[id] < plan.people[id].retirementAge ? plan.people[id].salary * index : 0));
    const wages = wagesByPerson.reduce((x, y) => x + y, 0);
    const ownBenefit = (id: PersonId) => {
      const p = plan.people[id];
      return p.ssPia * 12 * claimingFactor(p.ssClaimAge, p.birthYear) * index;
    };
    let socialSecurity = 0;
    for (const id of living) {
      const p = plan.people[id];
      if (ages[id] < p.ssClaimAge) continue;
      const other = PEOPLE.find((x) => x !== id)!;
      // A survivor keeps the larger of the two benefits.
      socialSecurity += died[other] ? Math.max(ownBenefit(id), ownBenefit(other)) : ownBenefit(id);
    }

    // Contributions while the owner works.
    const contributions = emptyBalances();
    let pretaxContributions = 0;
    for (const acc of accounts) {
      const owns = acc.owner === 'joint' ? working.length > 0 : working.includes(acc.owner);
      if (!owns || acc.contribution <= 0) continue;
      const amount = acc.contribution * index;
      acc.balance += amount;
      if (acc.type === 'taxable' || acc.type === 'cash') acc.basis += amount;
      contributions[acc.type] += amount;
      if (acc.type === 'traditional' || acc.type === 'hsa') pretaxContributions += amount;
    }
    const totalContributions = Object.values(contributions).reduce((x, y) => x + y, 0);

    // RMDs leave the traditional accounts as cash.
    let rmd = 0;
    for (const [acc, amount] of rmdByAccount) {
      const take = Math.min(amount, acc.balance);
      acc.balance -= take;
      rmd += take;
    }

    // Roth conversions once the household is retired.
    let conversion = 0;
    const convertAge = Math.max(...living.map((id) => ages[id]));
    if (allRetired && plan.strategy.rothConversion > 0 && convertAge < plan.strategy.rothConversionStopAge) {
      let want = plan.strategy.rothConversion * index;
      for (const acc of accounts) {
        if (acc.type !== 'traditional' || want <= 0) continue;
        const take = Math.min(want, acc.balance);
        if (take <= 0) continue;
        acc.balance -= take;
        want -= take;
        conversion += take;
        let roth = accounts.find((x) => x.type === 'roth' && x.owner === acc.owner);
        if (!roth) {
          roth = { type: 'roth', owner: acc.owner, balance: 0, basis: 0, contribution: 0 };
          accounts.push(roth);
        }
        roth.balance += take;
      }
    }

    // Spending need.
    const baseSpend = allRetired ? plan.retirementSpending : plan.preRetirementSpending;
    const spending = baseSpend * index * (living.length === 1 ? plan.survivorSpendingPct : 1);

    const over65 = living.filter((id) => ages[id] >= MEDICARE_AGE).length;
    const taxIn: TaxInputs = {
      status,
      index,
      wagesByPerson,
      pretaxContributions,
      socialSecurity,
      ordinaryOther: rmd + conversion + interest,
      over65,
      medicareEnrollees: over65,
      irmaaMagi: i >= 2 ? magiHistory[i - 2] : null,
      assumptions: a,
    };

    // Solve for the gross withdrawal that funds spending, contributions and taxes.
    const inflows = wages + socialSecurity + rmd;
    const sources = withdrawalSources(accounts, ageOf);
    const available = sources.reduce((x, s) => x + s.account.balance, 0);
    const net = (gross: number) => {
      const d = drawPlan(sources, gross);
      const tax = computeTaxes(taxIn, d.ordinary, d.gains, d.penaltyBase, interest);
      return { d, tax, net: inflows + gross - tax.total - spending - totalContributions };
    };
    let solved = net(0);
    if (solved.net < 0) {
      const full = net(available);
      if (full.net < 0) {
        solved = full;
      } else {
        let lo = 0;
        let hi = available;
        while (hi - lo > 0.01) {
          const mid = (lo + hi) / 2;
          if (net(mid).net < 0) lo = mid;
          else hi = mid;
        }
        solved = net(hi);
      }
    }

    const withdrawals = emptyBalances();
    sources.forEach((s, k) => {
      const take = solved.d.takes[k];
      if (take <= 0) return;
      if (s.type === 'taxable') s.account.basis *= 1 - take / s.account.balance;
      if (s.type === 'cash') s.account.basis -= take;
      s.account.balance -= take;
      withdrawals[s.type] += take;
    });

    const shortfall = Math.max(0, -solved.net);
    const savedSurplus = Math.max(0, solved.net);
    if (savedSurplus > 0) {
      let target = accounts.find((x) => x.type === 'taxable' && x.owner === 'joint');
      if (!target) {
        target = { type: 'taxable', owner: 'joint', balance: 0, basis: 0, contribution: 0 };
        accounts.push(target);
      }
      target.balance += savedSurplus;
      target.basis += savedSurplus;
    }
    if (shortfall > 0.5 && failureYear === null) failureYear = year;
    magiHistory.push(solved.tax.agi);

    const balances = sumBy(accounts);
    years.push({
      year,
      ages,
      alive,
      priceIndex: index,
      income: { wages, socialSecurity, rmd, interest },
      withdrawals,
      rothConversion: conversion,
      contributions,
      savedSurplus,
      spending,
      taxes: solved.tax,
      shortfall,
      balances,
      netWorth: Object.values(balances).reduce((x, y) => x + y, 0),
    });
  }

  const last = years[years.length - 1];
  return { years, success: failureYear === null, failureYear, estate: estateAtDeath(last, accounts, plan) };
}

/**
 * Estate at the end of the plan. Taxable accounts receive a full step-up in basis, Roth passes
 * tax free, traditional IRAs and HSAs are income to non-spouse heirs at `heirTaxRate`. The
 * federal estate tax uses both spouses' exclusions (portability) at a flat 40% above them.
 */
function estateAtDeath(last: YearResult, accounts: LiveAccount[], plan: Plan): Estate {
  const byType = sumBy(accounts);
  const gross = Object.values(byType).reduce((x, y) => x + y, 0);
  const exclusion = 2 * ESTATE_EXCLUSION * last.priceIndex;
  const federalEstateTax = Math.max(0, gross - exclusion) * ESTATE_TAX_RATE;
  const h = plan.assumptions.heirTaxRate;
  const heirsByType: Balances = {
    traditional: byType.traditional * (1 - h),
    roth: byType.roth,
    taxable: byType.taxable,
    hsa: byType.hsa * (1 - h),
    cash: byType.cash,
  };
  const heirsAfterTax = Object.values(heirsByType).reduce((x, y) => x + y, 0) - federalEstateTax;
  return { year: last.year, gross, federalEstateTax, heirsAfterTax, byType, heirsByType };
}
