import { describe, expect, it } from 'vitest';
import { parsePlan } from '../src/engine/planSchema';
import { samplePlan } from '../src/engine/samplePlan';

describe('parsePlan', () => {
  it('round-trips the sample plan through JSON', () => {
    const plan = samplePlan();
    expect(parsePlan(JSON.parse(JSON.stringify(plan)))).toEqual({ ok: true, plan });
  });

  it('rejects non-objects and missing sections', () => {
    expect(parsePlan(null).ok).toBe(false);
    expect(parsePlan('x').ok).toBe(false);
    const { people: _people, ...rest } = samplePlan();
    expect(parsePlan(rest).ok).toBe(false);
  });

  it('rejects non-finite or negative money', () => {
    const p = samplePlan();
    p.accounts[0].balance = -1;
    expect(parsePlan(p).ok).toBe(false);
    const q = JSON.parse(JSON.stringify(samplePlan()));
    q.retirementSpending = 'lots';
    expect(parsePlan(q).ok).toBe(false);
  });

  it('rejects unknown account types and joint retirement accounts', () => {
    const p = JSON.parse(JSON.stringify(samplePlan()));
    p.accounts[0].type = 'crypto';
    expect(parsePlan(p).ok).toBe(false);
    const q = samplePlan();
    q.accounts[0].owner = 'joint';
    const r = parsePlan(q);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/joint/);
  });

  it('rejects implausible ages', () => {
    const p = samplePlan();
    p.people.p1.endAge = 200;
    expect(parsePlan(p).ok).toBe(false);
  });

  it('drops unknown keys', () => {
    const p = { ...samplePlan(), extra: '<script>' } as unknown;
    const r = parsePlan(p);
    expect(r.ok && 'extra' in r.plan).toBe(false);
  });
});
