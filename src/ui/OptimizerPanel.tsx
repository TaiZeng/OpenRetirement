import { useEffect, useRef, useState } from 'react';
import { applyLevers, type OptimizeOptions, type OptimizeResult } from '../engine/optimizer';
import type { Plan } from '../engine/types';
import { pct, usd } from './format';

const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

function leverGrid(plan: Plan): OptimizeOptions['levers'] {
  const now = plan.people.p1;
  const currentAge = plan.startYear - now.birthYear;
  return {
    retirementAge: range(Math.max(currentAge + 1, 50), 70, 2),
    ssClaimAge: [62, 64, 67, 70],
    rothConversion: [0, 25_000, 50_000, 100_000, 150_000],
    withdrawalRate: [null, 0.03, 0.035, 0.04, 0.045, 0.05],
  };
}

export function OptimizerPanel({ plan, onApply }: { plan: Plan; onApply: (p: Plan) => void }) {
  const [objective, setObjective] = useState<OptimizeOptions['objective']>('estate');
  const [minSuccess, setMinSuccess] = useState(0.9);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const run = () => {
    worker.current?.terminate();
    const w = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    setBusy(true);
    setError(null);
    w.onmessage = (e: MessageEvent<{ ok: true; result: OptimizeResult } | { ok: false; error: string }>) => {
      setBusy(false);
      if (e.data.ok) setResult(e.data.result);
      else setError(e.data.error);
      w.terminate();
    };
    w.postMessage({ plan, opts: { objective, minSuccess, levers: leverGrid(plan) } satisfies OptimizeOptions });
  };

  const fmtWr = (v: number | null) => (v === null ? 'keep current spending' : pct(v, 1));
  const today = (v: number) => usd(v);

  return (
    <section className="card" data-testid="optimizer">
      <h2>Optimize</h2>
      <p className="muted">
        Coordinate search over retirement age, withdrawal rate, Roth conversions and Social Security claiming age. Each candidate is
        scored by historical replay.
      </p>
      <div className="row">
        <label>
          Goal
          <select value={objective} onChange={(e) => setObjective(e.currentTarget.value as OptimizeOptions['objective'])}>
            <option value="estate">Maximize estate value</option>
            <option value="success">Maximize chance of success</option>
          </select>
        </label>
        <label>
          Minimum success (%)
          <input type="number" step={1} value={minSuccess * 100} disabled={objective === 'success'} onChange={(e) => setMinSuccess(e.currentTarget.valueAsNumber / 100)} style={{ width: 80 }} />
        </label>
        <button className="primary" data-testid="run-optimizer" onClick={run} disabled={busy}>
          {busy ? 'Optimizing…' : 'Run optimizer'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {result && (
        <div data-testid="optimizer-result" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th />
                <th>Current</th>
                <th>Optimized</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Retirement age (P1)</td>
                <td>{result.baseline.levers.retirementAge}</td>
                <td data-testid="opt-retirement-age">{result.best.levers.retirementAge}</td>
              </tr>
              <tr>
                <td>Initial withdrawal rate</td>
                <td>{fmtWr(result.baseline.levers.withdrawalRate)}</td>
                <td>{fmtWr(result.best.levers.withdrawalRate)}</td>
              </tr>
              <tr>
                <td>Retirement spending</td>
                <td>{today(result.baseline.retirementSpending)}</td>
                <td>{today(result.best.retirementSpending)}</td>
              </tr>
              <tr>
                <td>Roth conversion / yr</td>
                <td>{today(result.baseline.levers.rothConversion)}</td>
                <td>{today(result.best.levers.rothConversion)}</td>
              </tr>
              <tr>
                <td>Social Security claim age</td>
                <td>{result.baseline.levers.ssClaimAge}</td>
                <td>{result.best.levers.ssClaimAge}</td>
              </tr>
              <tr>
                <td>Chance of success</td>
                <td>{pct(result.baseline.successRate)}</td>
                <td data-testid="opt-success">{pct(result.best.successRate)}</td>
              </tr>
              <tr>
                <td>Median estate to heirs (today&apos;s $)</td>
                <td>{today(result.baseline.medianEstate)}</td>
                <td data-testid="opt-estate">{today(result.best.medianEstate)}</td>
              </tr>
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => onApply(applyLevers(plan, result.best.levers))}>Apply to plan</button>
            <span className="muted">{result.evaluations} plans evaluated.</span>
          </div>
        </div>
      )}
    </section>
  );
}
