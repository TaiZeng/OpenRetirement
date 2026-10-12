import type { Account, AccountType, Assumptions, Owner, Person, Plan, Strategy } from './types';

export type ParseResult = { ok: true; plan: Plan } | { ok: false; error: string };

class Invalid extends Error {}

const ACCOUNT_TYPES: readonly AccountType[] = ['traditional', 'roth', 'taxable', 'hsa', 'cash'];
const OWNERS: readonly Owner[] = ['p1', 'p2', 'joint'];

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Invalid(`${path} must be an object`);
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string, path: string, min: number, max: number): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new Invalid(`${path}.${key} must be a number from ${min} to ${max}`);
  }
  return v;
}

function str(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.length > 200) throw new Invalid(`${path}.${key} must be a short string`);
  return v;
}

function oneOf<T extends string>(o: Record<string, unknown>, key: string, path: string, allowed: readonly T[]): T {
  const v = o[key];
  if (!allowed.includes(v as T)) throw new Invalid(`${path}.${key} must be one of ${allowed.join(', ')}`);
  return v as T;
}

const MONEY = 1e12;

function person(v: unknown, path: string): Person {
  const o = obj(v, path);
  return {
    name: str(o, 'name', path),
    birthYear: num(o, 'birthYear', path, 1900, 2100),
    endAge: num(o, 'endAge', path, 50, 120),
    retirementAge: num(o, 'retirementAge', path, 18, 100),
    salary: num(o, 'salary', path, 0, MONEY),
    ssPia: num(o, 'ssPia', path, 0, 100_000),
    ssClaimAge: num(o, 'ssClaimAge', path, 62, 70),
  };
}

function account(v: unknown, path: string): Account {
  const o = obj(v, path);
  const type = oneOf(o, 'type', path, ACCOUNT_TYPES);
  const owner = oneOf(o, 'owner', path, OWNERS);
  if (owner === 'joint' && type !== 'taxable' && type !== 'cash') {
    throw new Invalid(`${path}: only taxable and cash accounts can be joint`);
  }
  return {
    id: str(o, 'id', path),
    name: str(o, 'name', path),
    type,
    owner,
    balance: num(o, 'balance', path, 0, MONEY),
    costBasis: num(o, 'costBasis', path, 0, MONEY),
    contribution: num(o, 'contribution', path, 0, MONEY),
  };
}

function assumptions(v: unknown, path: string): Assumptions {
  const o = obj(v, path);
  const a: Assumptions = {
    stockReturn: num(o, 'stockReturn', path, -0.5, 0.5),
    bondReturn: num(o, 'bondReturn', path, -0.5, 0.5),
    cashReturn: num(o, 'cashReturn', path, -0.5, 0.5),
    inflation: num(o, 'inflation', path, -0.2, 0.5),
    stockVolatility: num(o, 'stockVolatility', path, 0, 1),
    bondVolatility: num(o, 'bondVolatility', path, 0, 1),
    stockPct: num(o, 'stockPct', path, 0, 1),
    bondPct: num(o, 'bondPct', path, 0, 1),
    stateTaxRate: num(o, 'stateTaxRate', path, 0, 0.2),
    stateTaxesSocialSecurity: o.stateTaxesSocialSecurity === true,
    heirTaxRate: num(o, 'heirTaxRate', path, 0, 0.6),
  };
  if (a.stockPct + a.bondPct > 1 + 1e-9) throw new Invalid(`${path}: stocks plus bonds cannot exceed 100%`);
  return a;
}

function strategy(v: unknown, path: string): Strategy {
  const o = obj(v, path);
  return {
    rothConversion: num(o, 'rothConversion', path, 0, MONEY),
    rothConversionStopAge: num(o, 'rothConversionStopAge', path, 0, 120),
  };
}

/** Validates untrusted input (imported JSON, localStorage) into a Plan, dropping unknown keys. */
export function parsePlan(input: unknown): ParseResult {
  try {
    const o = obj(input, 'plan');
    const people = obj(o.people, 'plan.people');
    if (!Array.isArray(o.accounts) || o.accounts.length > 100) throw new Invalid('plan.accounts must be a list of up to 100');
    const plan: Plan = {
      startYear: num(o, 'startYear', 'plan', 1900, 2200),
      people: { p1: person(people.p1, 'plan.people.p1'), p2: person(people.p2, 'plan.people.p2') },
      accounts: o.accounts.map((a, i) => account(a, `plan.accounts[${i}]`)),
      preRetirementSpending: num(o, 'preRetirementSpending', 'plan', 0, MONEY),
      retirementSpending: num(o, 'retirementSpending', 'plan', 0, MONEY),
      survivorSpendingPct: num(o, 'survivorSpendingPct', 'plan', 0, 1),
      assumptions: assumptions(o.assumptions, 'plan.assumptions'),
      strategy: strategy(o.strategy, 'plan.strategy'),
    };
    return { ok: true, plan };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}
