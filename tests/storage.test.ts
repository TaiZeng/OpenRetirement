import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, loadPlan, savePlan, exportPlanJson, importPlanJson } from '../src/ui/storage';
import { samplePlan } from '../src/engine/samplePlan';

function memoryStore(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('plan storage', () => {
  it('falls back to the sample plan when nothing is stored', () => {
    expect(loadPlan(memoryStore())).toEqual(samplePlan());
  });

  it('round-trips a saved plan', () => {
    const s = memoryStore();
    const plan = { ...samplePlan(), retirementSpending: 99_000 };
    savePlan(s, plan);
    expect(s.data.has(STORAGE_KEY)).toBe(true);
    expect(loadPlan(s)).toEqual(plan);
  });

  it('ignores corrupt or invalid stored data', () => {
    const s = memoryStore();
    s.setItem(STORAGE_KEY, '{not json');
    expect(loadPlan(s)).toEqual(samplePlan());
    s.setItem(STORAGE_KEY, JSON.stringify({ hello: 1 }));
    expect(loadPlan(s)).toEqual(samplePlan());
  });

  it('exports versioned JSON and imports it back', () => {
    const plan = samplePlan();
    const json = exportPlanJson(plan);
    expect(JSON.parse(json).format).toBe('openretirement-plan');
    expect(importPlanJson(json)).toEqual({ ok: true, plan });
  });

  it('rejects malformed imports with a message', () => {
    const r = importPlanJson('[]');
    expect(r.ok).toBe(false);
    expect(importPlanJson('nope').ok).toBe(false);
  });
});
