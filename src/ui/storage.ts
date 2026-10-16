import { parsePlan, type ParseResult } from '../engine/planSchema';
import { samplePlan } from '../engine/samplePlan';
import type { Plan } from '../engine/types';

export const STORAGE_KEY = 'openretirement.plan.v1';
const FORMAT = 'openretirement-plan';
const VERSION = 1;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function loadPlan(store: Store): Plan {
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw) {
      const r = parsePlan(JSON.parse(raw));
      if (r.ok) return r.plan;
    }
  } catch {
    // Corrupt storage falls through to the sample plan.
  }
  return samplePlan();
}

export function savePlan(store: Store, plan: Plan): void {
  store.setItem(STORAGE_KEY, JSON.stringify(plan));
}

export function exportPlanJson(plan: Plan): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, plan }, null, 2);
}

export function importPlanJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON' };
  }
  if (typeof data === 'object' && data !== null && (data as { format?: unknown }).format === FORMAT) {
    return parsePlan((data as { plan?: unknown }).plan);
  }
  return parsePlan(data);
}
