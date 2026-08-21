# DipBuy

A private, self-hosted personal investment monitoring and decision-support
tool for one user. It runs a **normal monthly investment + dip reserve**
strategy against NIFTY 50, alerts on WhatsApp when a market drawdown
qualifies, and never places a trade automatically.

## 1. What DipBuy does

Every month:
- Invests a fixed **normal amount**.
- Sets aside a fixed **reserve contribution** (part of the same budget, not
  extra money).
- When the market falls far enough from its recent high, calculates a
  **dip deployment** from the reserve and asks you to confirm it.
- If the reserve grows too large without a dip happening, automatically
  releases part of it into normal investment so cash never sits idle
  forever.
- Tracks every rupee in an auditable ledger and backtests the exact same
  logic against a plain SIP so you can see whether it's actually working.

## 2. The exact investment strategy

```
Monthly budget            Rs 10,000   (total — not Rs 10,000 + Rs 3,000)
Normal investment          Rs 7,000   invested every month, unconditionally
Reserve contribution       Rs 3,000   the delayed portion of the same budget
Maximum reserve           Rs 15,000
Cap release                Rs 7,000
Dip deployment multiplier    Rs 500   per elapsed month since the last dip deployment
```

All six values are configurable in Settings. **The Rs 3,000 is part of the
Rs 10,000, never added on top of it.** The dashboard only ever shows a
month's *total actual investment* above Rs 10,000 when that month actually
released reserve money (a dip deployment or a cap release) — never as a
restated "budget."

### Reserve cap

The reserve grows Rs 3,000/month until it hits Rs 15,000. At that point,
if no market dip has already brought it back down, Rs 7,000 is
automatically released into normal investment, leaving Rs 8,000 in
reserve. If a month's Rs 3,000 contribution would overshoot Rs 15,000, only
the amount up to the cap is retained — the overflow is still accounted for
as investment that month, never silently dropped.

### Market dip thresholds — gates, not amounts

```
-3%  -5%  -8%  -10%  -15%  -20%
```

These only answer "has the market fallen enough to activate the dip
mechanism." They do **not** set the deployment size. When a threshold is
crossed:

```
dipDeployment = min(
  Rs 500 × months since the last dip deployment,
  available reserve
)
```

A rapid move through several thresholds at once (e.g. -3% → -10% within
one price tick) still produces exactly **one** deployment decision, keyed
to the deepest threshold crossed — not one withdrawal per threshold.

### Reference high

`CURRENT_CYCLE_HIGH` by default: the highest price seen since the last new
high. A new high resets the reference and re-arms every threshold for the
new cycle; a bounce that doesn't exceed the prior high does not.

### Confirmation, always

Every dip deployment and every cap release is created as
`ACTION_PENDING`/pending confirmation. Nothing is recorded as an actual
investment, and the reserve balance does not change, until you tap
**Confirm** in the Dip Rules page (or **Skip**, which leaves the reserve
and the dip-deployment timer untouched — the timer keeps running rather
than resetting).

## 3. Architecture

```
strategyEngine.ts   <-- the ONE authoritative, pure, unit-tested module
      |         |
   worker    backtester
 (live ticks) (historical prices)
```

`backend/src/engine/strategyEngine.ts` contains every financial
calculation: `calculateMonthlyCycle`, `calculateDipDeployment`,
`validateStrategyConfig`. Both the live monitoring worker
(`backend/src/worker/monitor.ts`) and the backtester
(`backend/src/engine/backtest.ts`) call these same functions — there is no
second copy of the math anywhere, including the frontend, which only
displays what the backend computed.

`backend/src/engine/threshold.ts` and `referenceCycle.ts` handle the
market-side gate logic (drawdown %, threshold crossing, reference-cycle
resets) and are equally shared between live and backtest paths.

## 4. Primary market signal

NIFTY 50 is the default primary instrument — the one whose reserve the
strategy actually spends. Other indices (NIFTY 100/200/500/Bank/Midcap
150/Smallcap 250) can be added and monitored for information, but only the
instrument assigned via `POST /api/instruments/:id/set-primary` can
trigger a dip deployment against a given strategy's reserve. Version 1
ships with exactly one strategy ("NIFTY 50 DipBuy"), so there is exactly
one reserve.

## 5. Manual confirmation & INDmoney

There is no publicly documented, officially supported INDmoney API for
third-party write access as of this writing. `backend/src/services/brokerProvider.ts`
defines the `BrokerProvider` interface a real integration would need, and
ships only `UnavailableBrokerProvider`, which reports every capability
(`portfolioRead`, `balanceRead`, `orderPlacement`) as `false` and fails
loudly rather than fabricating data. The Portfolio page therefore always
shows "Actual broker cash: Not available" next to the planned reserve
figure — it never claims to know your real broker balance.

Until (if ever) an official API becomes available, every dip deployment
and cap release stays confirmation + manual-execution based: you place the
order yourself with your broker, then record the fill in Portfolio.

**Never implemented, on purpose:** INDmoney password/MPIN/OTP storage,
scraping, browser automation, reverse-engineered endpoints, or automatic
order placement of any kind.

## 6. WhatsApp

Official WhatsApp Business Cloud API only — no Web automation, no
unofficial libraries.

```
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_RECIPIENT_NUMBER=
WHATSAPP_API_VERSION=v20.0
```

Alerts (`DIPBUY ALERT` for a dip opportunity, `DIP RESERVE CAP` for a cap
release) always end with "No trade has been placed." and, when
confirmation is required, "ACTION REQUIRED: Open DipBuy to confirm or
skip." Credentials are read server-side only and never returned in any API
response.

## 7. Local-first privacy

Designed to run on `localhost` for one user. No public signup, no social
features, no analytics/tracking, no third-party aggregation beyond the
market-data and WhatsApp APIs you explicitly configure. Passwords, MPINs,
OTPs, and broker/WhatsApp tokens are never logged.

## 8. Backtesting

Compares **100% normal SIP** against **DipBuy** (or any custom
`StrategyConfig`) using `runBacktest()` — the same engine functions as
live monitoring, over 5/10/15/20-year historical windows, with no
look-ahead bias (the reference high at any simulated date uses only prices
up to and including that date). Reports total allocated vs. actually
invested, final value, absolute profit, CAGR, XIRR, max drawdown, average
purchase price, units accumulated, reserve utilization, dip/cap deployment
counts, and cash drag — and explicitly states whether DipBuy under- or
outperformed, never assuming it wins.

## 9. Simulation mode

```
SIMULATION_MODE=true
```

Then `POST /api/simulation/price {"symbol":"NIFTY50","price":23750}` (or
use the Dip Rules page panel) to verify each threshold fires at the right
price: 24250→-3%, 23750→-5%, 23000→-8%, 22500→-10%, 21250→-15%,
20000→-20%. Simulated prices never trigger a real WhatsApp send unless
WhatsApp alerts are separately enabled in Settings.

## 10. Database

PostgreSQL via Prisma. Schema covers `User`, `Strategy`,
`StrategySettings`, `Instrument`, `Threshold`, `ReferenceCycle`,
`MarketSnapshot`, `ThresholdEvent`, `ReserveLedgerEntry`,
`InvestmentCycle`, `Transaction`, `BacktestRun`/`BacktestResultRow`,
`Notification`, `AuditLog`, `BrokerConnection`. Monthly cycles are
idempotent via a unique `(strategyId, cycleMonth)` constraint on
`InvestmentCycle`; threshold events are idempotent via a unique
`(referenceCycleId, thresholdPercent)` constraint.

```bash
cd backend
npx prisma migrate dev --name init   # local dev
npx prisma migrate deploy            # production
```

## 11. Install & run

```bash
cd backend && npm install
cd ../frontend && npm install
cp .env.example .env   # set JWT_SECRET at minimum; SIMULATION_MODE=true to try it without a market-data key
```

**Docker (recommended for a real deployment):**
```bash
docker compose up --build
```
Starts Postgres, the API (`:4000`, runs `prisma migrate deploy` on boot),
the worker, and the frontend (`:5173`).

**Free online hosting (Render):**
This repo includes `render.yaml` — a Render Blueprint that deploys a free
Postgres database plus the backend and frontend as free Web Services in
one step:
1. Push this repo to GitHub.
2. In Render, "New" → "Blueprint" → point it at the repo. It reads
   `render.yaml` automatically.
3. Click Deploy. `JWT_SECRET` is auto-generated; `SIMULATION_MODE=true` is
   preset so it works without any market-data or WhatsApp credentials —
   you'll get a real public URL you can log into immediately.
4. Add real `MARKET_DATA_API_URL`/`MARKET_DATA_API_KEY` and `WHATSAPP_*`
   values later in the Render dashboard once you have them, then redeploy.

Render's free tier has no separate Background Worker option, so the
backend runs `dist/serverWithWorker.js` instead of `dist/server.js` — this
runs the API and the monitoring loop in one process. It's functionally
identical to the Docker setup's separate worker; only the process boundary
differs. Free-tier web services also sleep after 15 minutes of inactivity
and spin back up on the next request (with a ~30s cold start), and the
free Postgres database expires after 30 days unless upgraded — fine for
trying it out, not for a strategy you're relying on long-term.

**Without Docker, locally:**
```bash
cd backend
npx prisma migrate dev --name init
npm run dev        # API on :4000
npm run worker      # background monitor, separate terminal

cd ../frontend
npm run dev          # :5173
```

## 12. Tests

```bash
cd backend
npm test
```

38 tests, including the 8 required scenarios from the spec (five-month
accumulation to the Rs 15,000 cap and release; a Rs 500×4-month dip
deployment; deployment capped by available reserve; two sequential dip
deployments; continued accumulation without exceeding the cap after a cap
release; a rapid multi-threshold move collapsing to one action; a skipped
dip leaving the reserve and timer untouched; and a new cycle high
resetting threshold state while preserving history) — every one run
directly against `strategyEngine.ts`, `threshold.ts`, and
`referenceCycle.ts`.

## 13. Backup / restore

Postgres is the single source of truth. Use standard tooling:

```bash
pg_dump "$DATABASE_URL" > dipbuy-backup.sql
psql "$DATABASE_URL" < dipbuy-backup.sql
```

No built-in export/import UI ships yet — this is the current, honest
state, not a planned feature described as done.

## 14. Security

- JWT bearer auth on every private route; `JWT_SECRET` must be set to a
  real random value before running anywhere but a local sandbox.
- No credentials are ever returned in API responses or logged.
- `BrokerConnection.encryptedCredentialsRef` stores only an opaque
  reference to an external encrypted secret store — never a raw secret —
  and is unused today since no broker integration exists yet.
