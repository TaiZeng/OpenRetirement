import type { Account, AccountType, Assumptions, Owner, Person, PersonId, Plan } from '../engine/types';

const ACCOUNT_LABELS: Record<AccountType, string> = {
  traditional: '401(k) / Traditional IRA',
  roth: 'Roth 401(k) / Roth IRA',
  taxable: 'Taxable brokerage',
  hsa: 'HSA',
  cash: 'Cash / savings',
};

function NumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  percent?: boolean;
  testId?: string;
}) {
  const scale = props.percent ? 100 : 1;
  return (
    <label>
      {props.label}
      <input
        type="number"
        data-testid={props.testId}
        step={props.step ?? (props.percent ? 0.1 : 1)}
        value={Number((props.value * scale).toFixed(6))}
        onChange={(e) => {
          const v = e.currentTarget.valueAsNumber;
          if (Number.isFinite(v)) props.onChange(v / scale);
        }}
      />
    </label>
  );
}

function PersonFields({ id, person, onChange }: { id: PersonId; person: Person; onChange: (p: Person) => void }) {
  const set = <K extends keyof Person>(k: K, v: Person[K]) => onChange({ ...person, [k]: v });
  return (
    <>
      <h3>{id === 'p1' ? 'Person 1' : 'Person 2'}</h3>
      <div className="grid2">
        <label>
          Name
          <input value={person.name} onChange={(e) => set('name', e.currentTarget.value)} />
        </label>
        <NumberField label="Birth year" value={person.birthYear} onChange={(v) => set('birthYear', v)} testId={`${id}-birthYear`} />
        <NumberField label="Retirement age" value={person.retirementAge} onChange={(v) => set('retirementAge', v)} testId={`${id}-retirementAge`} />
        <NumberField label="Plan to age" value={person.endAge} onChange={(v) => set('endAge', v)} />
        <NumberField label="Salary ($/yr)" value={person.salary} step={1000} onChange={(v) => set('salary', v)} testId={`${id}-salary`} />
        <NumberField label="SS benefit at FRA ($/mo)" value={person.ssPia} step={50} onChange={(v) => set('ssPia', v)} />
        <NumberField label="SS claiming age" value={person.ssClaimAge} onChange={(v) => set('ssClaimAge', v)} />
      </div>
    </>
  );
}

function AccountsTable({ accounts, onChange }: { accounts: Account[]; onChange: (a: Account[]) => void }) {
  const update = (i: number, patch: Partial<Account>) =>
    onChange(accounts.map((a, k) => (k === i ? { ...a, ...patch } : a)));
  const add = () =>
    onChange([
      ...accounts,
      { id: crypto.randomUUID(), name: 'New account', type: 'taxable', owner: 'joint', balance: 0, costBasis: 0, contribution: 0 },
    ]);
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Owner</th>
            <th>Balance</th>
            <th>Basis</th>
            <th>Contrib/yr</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {accounts.map((a, i) => {
            const jointAllowed = a.type === 'taxable' || a.type === 'cash';
            return (
              <tr key={a.id}>
                <td>
                  <input aria-label="Account name" value={a.name} onChange={(e) => update(i, { name: e.currentTarget.value })} />
                </td>
                <td>
                  <select
                    aria-label="Account type"
                    value={a.type}
                    onChange={(e) => {
                      const type = e.currentTarget.value as AccountType;
                      const ok = type === 'taxable' || type === 'cash';
                      update(i, { type, owner: !ok && a.owner === 'joint' ? 'p1' : a.owner });
                    }}
                  >
                    {Object.entries(ACCOUNT_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select aria-label="Owner" value={a.owner} onChange={(e) => update(i, { owner: e.currentTarget.value as Owner })}>
                    <option value="p1">P1</option>
                    <option value="p2">P2</option>
                    {jointAllowed && <option value="joint">Joint</option>}
                  </select>
                </td>
                {(['balance', 'costBasis', 'contribution'] as const).map((k) => (
                  <td key={k}>
                    <input
                      type="number"
                      aria-label={k}
                      step={1000}
                      disabled={k === 'costBasis' && a.type !== 'taxable'}
                      value={a[k]}
                      onChange={(e) => {
                        const v = e.currentTarget.valueAsNumber;
                        if (Number.isFinite(v) && v >= 0) update(i, { [k]: v });
                      }}
                    />
                  </td>
                ))}
                <td>
                  <button aria-label={`Remove ${a.name}`} onClick={() => onChange(accounts.filter((_, k) => k !== i))}>
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={add}>Add account</button>
      </div>
    </>
  );
}

export function PlanForm({ plan, onChange }: { plan: Plan; onChange: (p: Plan) => void }) {
  const setA = <K extends keyof Assumptions>(k: K, v: Assumptions[K]) =>
    onChange({ ...plan, assumptions: { ...plan.assumptions, [k]: v } });
  const a = plan.assumptions;
  return (
    <div data-testid="plan-form">
      <section className="card">
        <h2>Household (married filing jointly)</h2>
        <PersonFields id="p1" person={plan.people.p1} onChange={(p) => onChange({ ...plan, people: { ...plan.people, p1: p } })} />
        <PersonFields id="p2" person={plan.people.p2} onChange={(p) => onChange({ ...plan, people: { ...plan.people, p2: p } })} />
      </section>

      <section className="card">
        <h2>Accounts</h2>
        <AccountsTable accounts={plan.accounts} onChange={(accounts) => onChange({ ...plan, accounts })} />
        <p className="muted">Today&apos;s dollars. Basis applies to taxable accounts. Contributions stop when the owner retires.</p>
      </section>

      <section className="card">
        <h2>Spending</h2>
        <div className="grid2">
          <NumberField label="While working ($/yr)" value={plan.preRetirementSpending} step={1000} onChange={(v) => onChange({ ...plan, preRetirementSpending: v })} />
          <NumberField label="In retirement ($/yr)" value={plan.retirementSpending} step={1000} onChange={(v) => onChange({ ...plan, retirementSpending: v })} testId="retirementSpending" />
          <NumberField label="Survivor spending (%)" percent value={plan.survivorSpendingPct} onChange={(v) => onChange({ ...plan, survivorSpendingPct: v })} />
        </div>
      </section>

      <section className="card">
        <h2>Assumptions</h2>
        <div className="grid2">
          <NumberField label="Stocks return (%)" percent value={a.stockReturn} onChange={(v) => setA('stockReturn', v)} />
          <NumberField label="Stocks volatility (%)" percent value={a.stockVolatility} onChange={(v) => setA('stockVolatility', v)} />
          <NumberField label="Bonds return (%)" percent value={a.bondReturn} onChange={(v) => setA('bondReturn', v)} />
          <NumberField label="Bonds volatility (%)" percent value={a.bondVolatility} onChange={(v) => setA('bondVolatility', v)} />
          <NumberField label="Cash return (%)" percent value={a.cashReturn} onChange={(v) => setA('cashReturn', v)} />
          <NumberField label="Inflation (%)" percent value={a.inflation} onChange={(v) => setA('inflation', v)} />
          <NumberField label="Stock allocation (%)" percent value={a.stockPct} onChange={(v) => setA('stockPct', v)} />
          <NumberField label="Bond allocation (%)" percent value={a.bondPct} onChange={(v) => setA('bondPct', v)} />
          <NumberField label="State income tax (%)" percent value={a.stateTaxRate} onChange={(v) => setA('stateTaxRate', v)} />
          <NumberField label="Heirs' tax rate (%)" percent value={a.heirTaxRate} onChange={(v) => setA('heirTaxRate', v)} />
          <label className="check">
            <input type="checkbox" checked={a.stateTaxesSocialSecurity} onChange={(e) => setA('stateTaxesSocialSecurity', e.currentTarget.checked)} />
            State taxes Social Security
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Roth conversions</h2>
        <div className="grid2">
          <NumberField label="Convert per year ($)" value={plan.strategy.rothConversion} step={5000} onChange={(v) => onChange({ ...plan, strategy: { ...plan.strategy, rothConversion: v } })} />
          <NumberField label="Stop at age" value={plan.strategy.rothConversionStopAge} onChange={(v) => onChange({ ...plan, strategy: { ...plan.strategy, rothConversionStopAge: v } })} />
        </div>
        <p className="muted">Conversions run each year after both spouses retire.</p>
      </section>
    </div>
  );
}
