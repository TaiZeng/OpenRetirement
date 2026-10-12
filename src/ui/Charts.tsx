import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMemo, useState } from 'react';
import { cashFlowRows, cashFlowSankey } from '../engine/cashflow';
import type { SimulationResult } from '../engine/montecarlo';
import type { ProjectionResult } from '../engine/types';
import { compactUsd, pct, usd } from './format';

const money = (v: unknown) => usd(Number(v));

export function SuccessChart({ sim }: { sim: SimulationResult }) {
  const data = sim.years.map((year, i) => ({
    year,
    band: [sim.percentiles.netWorth.p10[i], sim.percentiles.netWorth.p90[i]],
    median: sim.percentiles.netWorth.p50[i],
  }));
  return (
    <section className="card" data-testid="chart-success">
      <h2>
        Chance of success: <span data-testid="success-rate">{pct(sim.successRate)}</span>
      </h2>
      <p className="muted">
        {sim.mode === 'historical'
          ? `Replayed every historical start year (${sim.trials} sequences), cFIREsim style.`
          : `${sim.trials} simulated trials.`}{' '}
        Shaded band is the 10th to 90th percentile of net worth in today&apos;s dollars.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ left: 10, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" />
          <YAxis tickFormatter={compactUsd} width={60} />
          <Tooltip formatter={(v) => (Array.isArray(v) ? v.map(money).join(' to ') : money(v))} />
          <Area dataKey="band" name="10th-90th percentile" fill="#2463eb" fillOpacity={0.15} stroke="none" isAnimationActive={false} />
          <Line dataKey="median" name="Median" stroke="#2463eb" dot={false} strokeWidth={2} isAnimationActive={false} />
          <Legend />
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}

const ACCOUNT_COLORS = { traditional: '#2463eb', roth: '#12b76a', taxable: '#f79009', hsa: '#7a5af8', cash: '#98a2b3' } as const;

export function NetWorthChart({ projection }: { projection: ProjectionResult }) {
  const data = projection.years.map((y) => ({
    year: y.year,
    ...Object.fromEntries(Object.entries(y.balances).map(([k, v]) => [k, v / y.priceIndex])),
  }));
  return (
    <section className="card" data-testid="chart-networth">
      <h2>Net worth over time</h2>
      <p className="muted">Expected-return projection by account type, today&apos;s dollars.</p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ left: 10, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" />
          <YAxis tickFormatter={compactUsd} width={60} />
          <Tooltip formatter={money} />
          <Legend />
          {(Object.keys(ACCOUNT_COLORS) as (keyof typeof ACCOUNT_COLORS)[]).map((k) => (
            <Area key={k} dataKey={k} stackId="1" stroke={ACCOUNT_COLORS[k]} fill={ACCOUNT_COLORS[k]} fillOpacity={0.6} isAnimationActive={false} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}

export function CashFlowChart({ projection }: { projection: ProjectionResult }) {
  const rows = useMemo(() => cashFlowRows(projection), [projection]);
  const firstRetired = projection.years.find((y) => y.income.wages === 0)?.year ?? projection.years[0].year;
  const [year, setYear] = useState(firstRetired);
  const y = projection.years.find((x) => x.year === year) ?? projection.years[0];
  const sankey = useMemo(() => cashFlowSankey(y), [y]);
  return (
    <section className="card" data-testid="chart-cashflow">
      <h2>Cash flow</h2>
      <p className="muted">Income and withdrawals (bars up) against spending, taxes and saving (line), today&apos;s dollars. Withdrawal order: cash, taxable, traditional, Roth.</p>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={rows} margin={{ left: 10, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" />
          <YAxis tickFormatter={compactUsd} width={60} />
          <Tooltip formatter={money} />
          <Legend />
          <Bar dataKey="wages" name="Wages" stackId="in" fill="#2463eb" isAnimationActive={false} />
          <Bar dataKey="socialSecurity" name="Social Security" stackId="in" fill="#12b76a" isAnimationActive={false} />
          <Bar dataKey="rmd" name="RMDs" stackId="in" fill="#7a5af8" isAnimationActive={false} />
          <Bar dataKey="withdrawals" name="Withdrawals" stackId="in" fill="#f79009" isAnimationActive={false} />
          <Line dataKey="spending" name="Spending" stroke="#1c2430" dot={false} isAnimationActive={false} />
          <Line dataKey="taxes" name="Taxes" stroke="#b42318" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="row" style={{ marginTop: 8 }}>
        <label className="check">
          Sankey for year
          <input
            type="number"
            data-testid="sankey-year"
            min={projection.years[0].year}
            max={projection.years.at(-1)!.year}
            value={year}
            onChange={(e) => setYear(e.currentTarget.valueAsNumber)}
            style={{ width: 80 }}
          />
        </label>
        <span className="muted">
          Taxes {usd(y.taxes.total)} (federal {usd(y.taxes.federalOrdinary + y.taxes.federalLtcg)}, state {usd(y.taxes.state)}, IRMAA {usd(y.taxes.irmaa)})
        </span>
      </div>
      <div data-testid="sankey">
        <ResponsiveContainer width="100%" height={240}>
          <Sankey data={sankey} nodePadding={18} margin={{ left: 10, right: 120, top: 10, bottom: 10 }} link={{ stroke: '#2463eb', strokeOpacity: 0.25 }} node={{ fill: '#2463eb' }}>
            <Tooltip formatter={money} />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function EstateChart({ projection }: { projection: ProjectionResult }) {
  const e = projection.estate;
  const k = 1 / projection.years.at(-1)!.priceIndex;
  const labels = { traditional: 'Traditional', roth: 'Roth', taxable: 'Taxable (stepped-up)', hsa: 'HSA', cash: 'Cash' } as const;
  const data = (Object.keys(labels) as (keyof typeof labels)[])
    .filter((t) => e.byType[t] > 0)
    .map((t) => ({ name: labels[t], gross: e.byType[t] * k, heirs: e.heirsByType[t] * k }));
  return (
    <section className="card" data-testid="chart-estate">
      <h2>Estate in {e.year}</h2>
      <p className="muted">
        Gross <strong data-testid="estate-gross">{usd(e.gross * k)}</strong>, heirs receive{' '}
        <strong data-testid="estate-heirs">{usd(e.heirsAfterTax * k)}</strong> after income and estate tax (today&apos;s dollars).
        Roth passes tax free; traditional and HSA are taxed at the heirs&apos; rate; taxable accounts get a step-up in basis.
        {e.federalEstateTax > 0 && ` Federal estate tax: ${usd(e.federalEstateTax * k)}.`}
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ left: 10, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis tickFormatter={compactUsd} width={60} />
          <Tooltip formatter={money} />
          <Legend />
          <Bar dataKey="gross" name="Account value" fill="#98a2b3" isAnimationActive={false} />
          <Bar dataKey="heirs" name="Heirs after tax" fill="#12b76a" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}
