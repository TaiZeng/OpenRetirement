# OpenRetirement

Open-source, local-first retirement and financial planner.

Enter your finances and see your chance of success, net worth over time, cash flow,
taxes, estate outcomes, and optimized strategies. Your data stays on your machine.

## Status

v1: married filing jointly, US federal tax plus a flat state rate.

## Run it

Requires Node 22 and an internet connection on first run.

```sh
npm install
npx playwright install chromium   # once, for the browser tests
npm run dev                        # http://localhost:5173
npm test                           # unit, golden, and Playwright tests
```

## Historical data

Historical returns come from Amit Goyal and Ivo Welch's dataset
(https://www.ivo-welch.org/professional/goyal-welch/). The data is not redistributed in this
repository. `scripts/build-returns.mjs` downloads it the first time you run `dev`, `test`, or
`build`, checks it against a pinned SHA-256 so results stay reproducible, and writes the
git-ignored `src/data/historicalReturns.ts`. Run `npm run data:returns` to re-download.
If the upstream file changes, the script stops and asks you to review the new data before
updating the pinned hash.

## Principles

- **Local-first:** no accounts and no server-side storage of your financial data.
- **Transparent math:** every calculation uses public, documented methods and is covered by tests.
- **Clean-room:** this project is not derived from any proprietary planner's code or interface.

## License

[MIT](LICENSE)
