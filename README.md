# Alpha Core ledger

Private dashboard for the Alpha Core EA. The EA posts a report every five minutes (account, open positions, recent deals, and every signal it traded or skipped); this app stores the reports and shows them.

## How it fits together

```
MT5 (VPS)  --POST /api/ingest + X-Ingest-Token-->  Vercel (Next.js)  -->  Upstash Redis
you        --password login-->                     dashboard pages
```

- `src/app/api/ingest/route.ts` validates and stores a report.
- `src/lib/trades.ts` turns deals into closed trades and splits EA from manual by magic number.
- `src/lib/benchmark.ts` holds the backtest figures the live results are compared with.
- `src/proxy.ts` puts every page except `/login` and `/api/ingest` behind the login.

## Environment variables

| Name | What it is |
|---|---|
| `DASHBOARD_PASSWORD` | Login password, at least 12 characters |
| `SESSION_SECRET` | Random string, at least 32 characters; signs the login cookie |
| `INGEST_TOKEN` | Random string, at least 32 characters; the same value goes in the EA input `InpReportToken` |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis; added by the Vercel integration |

## Run locally

```bash
npm install
npm run dev -- -p 3111        # uses .env.local and a local file (.data/store.json) instead of Redis
python scripts/seed_from_mt5.py http://localhost:3111   # loads your MT5 history; MT5 must be open
npm test
```

## Deploy to Vercel

1. Push this folder to a private GitHub repository and import it in Vercel (framework: Next.js, root: this folder).
2. In the Vercel project, open **Storage**, add **Upstash for Redis** and connect it. This sets the two `KV_` variables.
3. Under **Settings > Environment Variables**, add `DASHBOARD_PASSWORD`, `SESSION_SECRET` and `INGEST_TOKEN`. Redeploy.
4. Open the site and sign in. It shows "Waiting for the first report" until the EA is connected.

## Connect the EA

1. In MT5: **Tools > Options > Expert Advisors**, tick **Allow WebRequest for listed URL** and add `https://<your-site>.vercel.app`.
2. On the chart, open the EA's inputs and set `InpReportUrl` to `https://<your-site>.vercel.app/api/ingest` and `InpReportToken` to the `INGEST_TOKEN` value.
3. Turn Algo Trading on, then right-click the VPS and choose **Synchronize experts, indicators**.
4. The VPS Experts log should print `AlphaCore dashboard: first report delivered` within a few minutes. If it prints an error, the message says what to fix.

To load history from before the EA was connected, run `python scripts/seed_from_mt5.py https://<your-site>.vercel.app 90` with `INGEST_TOKEN` set in the environment.

## Several setups on one account

Each setup is one copy of the EA on its own chart, with its own `InpMagic` and `InpSetupName`. Every copy reports to the same address with the same token. The dashboard keeps one status per magic number and splits trades, the calendar, the profit chart, the backtest comparison and the signal log by setup. Trades whose magic number belongs to no reporting setup count as manual.

Backtest figures per timeframe live in `src/lib/benchmark.ts`.

## Notes

- Reporting cannot place or change trades. It stays quiet for 12 seconds either side of a candle close so it never delays an entry, and backs off for two minutes after a failed report.
- The token is an EA input, so it appears in the MT5 Experts log. Anyone with it can post reports (not read them, and not trade). Change `INGEST_TOKEN` in Vercel and in the EA if it leaks.
