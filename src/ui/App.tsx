import { useEffect, useMemo, useRef, useState } from 'react';
import { runMonteCarlo, type SimulationMode } from '../engine/montecarlo';
import { parsePlan } from '../engine/planSchema';
import { constantMarkets, horizonYears, projectPlan } from '../engine/projection';
import { samplePlan } from '../engine/samplePlan';
import type { Plan } from '../engine/types';
import { CashFlowChart, EstateChart, NetWorthChart, SuccessChart } from './Charts';
import { pct, usd } from './format';
import { OptimizerPanel } from './OptimizerPanel';
import { PlanForm } from './PlanForm';
import { exportPlanJson, importPlanJson, loadPlan, savePlan } from './storage';

export function App() {
  const [plan, setPlan] = useState<Plan>(() => loadPlan(localStorage));
  const [mode, setMode] = useState<SimulationMode>('historical');
  const [seed, setSeed] = useState(12345);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => savePlan(localStorage, plan), [plan]);

  // The form can hold transient invalid values (e.g. a blank birth year); only valid plans are computed.
  const valid = useMemo(() => parsePlan(plan), [plan]);
  const computed = useMemo(() => {
    if (!valid.ok) return null;
    const p = valid.plan;
    return {
      projection: projectPlan(p, constantMarkets(p.assumptions, horizonYears(p))),
      sim: runMonteCarlo(p, mode === 'historical' ? { mode } : { mode, trials: 1000, seed }),
    };
  }, [valid, mode, seed]);

  const exportJson = () => {
    const blob = new Blob([exportPlanJson(plan)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'openretirement-plan.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    const r = importPlanJson(await file.text());
    if (r.ok) {
      setPlan(r.plan);
      setImportError(null);
    } else setImportError(r.error);
  };

  return (
    <>
      <header>
        <h1>OpenRetirement</h1>
        <p>Local-first retirement planner. Your data stays in this browser.</p>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <button onClick={exportJson} data-testid="export">Export JSON</button>
          <button onClick={() => fileInput.current?.click()}>Import JSON</button>
          <input ref={fileInput} type="file" accept="application/json" hidden onChange={(e) => e.currentTarget.files?.[0] && importJson(e.currentTarget.files[0])} />
          <button onClick={() => setPlan(samplePlan())}>Load sample</button>
        </div>
      </header>
      {importError && <p className="error" style={{ padding: '0 24px' }}>{importError}</p>}
      <main>
        <PlanForm plan={plan} onChange={setPlan} />
        <div>
          {!valid.ok && <section className="card error" data-testid="plan-error">{valid.error}</section>}
          {computed && (
            <>
              <div className="kpis" style={{ marginBottom: 16 }}>
                <div className="kpi">
                  <div className={`v ${computed.sim.successRate >= 0.85 ? 'good' : 'bad'}`}>{pct(computed.sim.successRate)}</div>
                  <div className="l">Chance of success</div>
                </div>
                <div className="kpi">
                  <div className="v">{usd(Math.max(...computed.projection.years.map((y) => y.netWorth / y.priceIndex)))}</div>
                  <div className="l">Peak net worth (today&apos;s $)</div>
                </div>
                <div className="kpi">
                  <div className="v">{usd(computed.projection.years.reduce((a, y) => a + y.taxes.total / y.priceIndex, 0))}</div>
                  <div className="l">Lifetime taxes (today&apos;s $)</div>
                </div>
                <div className="kpi">
                  <div className="v">{usd(computed.projection.estate.heirsAfterTax / computed.projection.years.at(-1)!.priceIndex)}</div>
                  <div className="l">Heirs after tax (today&apos;s $)</div>
                </div>
              </div>
              <section className="card">
                <div className="row">
                  <label>
                    Returns
                    <select data-testid="sim-mode" value={mode} onChange={(e) => setMode(e.currentTarget.value as SimulationMode)}>
                      <option value="historical">Historical replay (1926–2020)</option>
                      <option value="simulated">Monte Carlo (simulated)</option>
                    </select>
                  </label>
                  {mode === 'simulated' && (
                    <label>
                      Seed
                      <input type="number" value={seed} onChange={(e) => Number.isFinite(e.currentTarget.valueAsNumber) && setSeed(e.currentTarget.valueAsNumber)} style={{ width: 100 }} />
                    </label>
                  )}
                </div>
              </section>
              <div className="charts">
                <SuccessChart sim={computed.sim} />
                <NetWorthChart projection={computed.projection} />
                <CashFlowChart projection={computed.projection} />
                <EstateChart projection={computed.projection} />
              </div>
              <div style={{ marginTop: 16 }}>
                <OptimizerPanel plan={valid.ok ? valid.plan : plan} onApply={setPlan} />
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
