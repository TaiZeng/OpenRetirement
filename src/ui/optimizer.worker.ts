import { optimizePlan, type OptimizeOptions } from '../engine/optimizer';
import type { Plan } from '../engine/types';

self.onmessage = (e: MessageEvent<{ plan: Plan; opts: OptimizeOptions }>) => {
  try {
    self.postMessage({ ok: true, result: optimizePlan(e.data.plan, e.data.opts) });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
