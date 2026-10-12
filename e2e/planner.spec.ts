import { expect, test, type Page } from '@playwright/test';

const SHOTS = 'artifacts/screenshots';

async function setNumber(page: Page, testId: string, value: number) {
  const input = page.getByTestId(testId);
  await input.fill(String(value));
  await expect(input).toHaveValue(String(value));
}

test('a sample plan entered in the form renders all four charts and an optimizer result', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Enter a synthetic household through the form.
  await setNumber(page, 'p1-birthYear', 1980);
  await setNumber(page, 'p1-salary', 160000);
  await setNumber(page, 'p1-retirementAge', 60);
  await setNumber(page, 'p2-birthYear', 1982);
  await setNumber(page, 'p2-salary', 95000);
  await setNumber(page, 'p2-retirementAge', 58);
  await setNumber(page, 'retirementSpending', 105000);
  await page.getByRole('button', { name: 'Add account' }).click();
  const lastRow = page.locator('tbody tr').last();
  await lastRow.getByLabel('Account name').fill('Brokerage (new)');
  await lastRow.getByLabel('balance').fill('75000');
  await lastRow.getByLabel('costBasis').fill('60000');

  await expect(page.getByTestId('plan-error')).toHaveCount(0);

  // Chance of success.
  const success = page.getByTestId('success-rate');
  await expect(success).toHaveText(/^\d{1,3}%$/);
  const rate = Number((await success.textContent())!.replace('%', ''));
  expect(rate).toBeGreaterThanOrEqual(0);
  expect(rate).toBeLessThanOrEqual(100);

  // Every chart renders an SVG with drawn marks.
  for (const id of ['chart-success', 'chart-networth', 'chart-cashflow', 'chart-estate']) {
    const chart = page.getByTestId(id);
    await expect(chart.locator('svg.recharts-surface').first()).toBeVisible();
    await expect(chart.locator('path, rect').first()).toBeVisible();
  }
  await expect(page.getByTestId('sankey').locator('.recharts-sankey-node, .recharts-sankey-nodes rect, g rect').first()).toBeVisible();
  await expect(page.getByTestId('estate-heirs')).toHaveText(/^\$[\d,]+$/);

  // Measure what was drawn: real chart size and enough marks to be a chart, not an empty frame.
  const geometry = await page.evaluate(() => {
    const ids = ['chart-success', 'chart-networth', 'chart-cashflow', 'chart-estate', 'sankey'];
    return Object.fromEntries(
      ids.map((id) => {
        const root = document.querySelector(`[data-testid="${id}"]`)!;
        // Legend icons are also svg.recharts-surface; the chart is the largest one.
        const svg = [...root.querySelectorAll('svg.recharts-surface')]
          .map((e) => e.getBoundingClientRect())
          .reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
        const marks = root.querySelectorAll(
          '.recharts-area-area, .recharts-line-curve, .recharts-bar-rectangle, .recharts-sankey-link, .recharts-sankey-node, .recharts-rectangle',
        ).length;
        return [id, { w: Math.round(svg.width), h: Math.round(svg.height), marks }];
      }),
    );
  });
  console.log('chart geometry', JSON.stringify(geometry));
  for (const [id, g] of Object.entries(geometry)) {
    expect(g.w, id).toBeGreaterThan(300);
    expect(g.h, id).toBeGreaterThan(150);
    expect(g.marks, id).toBeGreaterThan(id === 'chart-success' ? 1 : 3);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Form edits reach the projection: localStorage holds the edited plan.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('openretirement.plan.v1')!));
  expect(saved.people.p1.salary).toBe(160000);
  expect(saved.accounts.at(-1).name).toBe('Brokerage (new)');

  await page.screenshot({ path: `${SHOTS}/01-plan-and-charts.png`, fullPage: true });

  // Monte Carlo mode with a fixed seed is reproducible in the UI.
  await page.getByTestId('sim-mode').selectOption('simulated');
  await expect(success).toHaveText(/^\d{1,3}%$/);
  const first = await success.textContent();
  await page.getByTestId('sim-mode').selectOption('historical');
  await page.getByTestId('sim-mode').selectOption('simulated');
  await expect(success).toHaveText(first!);

  // Optimizer.
  await page.getByTestId('run-optimizer').click();
  const result = page.getByTestId('optimizer-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('opt-success')).toHaveText(/^\d{1,3}%$/);
  await expect(page.getByTestId('opt-estate')).toHaveText(/^\$[\d,]+$/);
  await expect(page.getByTestId('opt-retirement-age')).toHaveText(/^\d{2}$/);
  await result.scrollIntoViewIfNeeded();
  await page.getByTestId('optimizer').screenshot({ path: `${SHOTS}/02-optimizer-result.png` });
  await page.screenshot({ path: `${SHOTS}/03-full-page.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('plan survives a reload via localStorage', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await setNumber(page, 'retirementSpending', 87000);
  await page.reload();
  await expect(page.getByTestId('retirementSpending')).toHaveValue('87000');
});
