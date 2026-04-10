# Codex Context

Last updated: 2026-04-10 (Asia/Seoul)

## Project

- Name: `stock-lab`
- Root path: `C:\Users\vivac\OneDrive\문서\aa\stock-lab`
- GitHub repo: [vivaca86/oo](https://github.com/vivaca86/oo)
- Frontend site: [https://vivaca86.github.io/oo/](https://vivaca86.github.io/oo/)
- This project is separate from `isarich`.

## Goal

Build a stock equal-rate web app that behaves like the user's Google Sheet model:

- Columns: `날짜 / KOSPI / 주식1 ~ 주식7`
- Cells show only equal rates
- The selected date defaults to today but can be changed
- When the date changes, show trading days in that month only
- The first trading day of a month compares against the previous month's last trading day close
- Holidays and market-closed days should not appear as fake rows
- When the selected date is today and the market is open, today's row should update live
- Stock name input should resolve automatically, including fuzzy input

## Live Architecture

### Frontend

- Main files:
  - [index.html](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/index.html)
  - [app.js](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/app.js)
  - [styles.css](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/styles.css)
  - [config.js](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/config.js)

### REST gateway

- File: [stock-eq-gateway.gs](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/apps-script/stock-eq-gateway.gs)
- Apps Script project:
  [project editor](https://script.google.com/home/projects/13aWS-lCZTa2Rii1DMy9y1DKZVsJ2pR6PabbM-9vj0puK4HCoQXT5j4Gd/edit)
- Public exec URL:
  `https://script.google.com/macros/s/AKfycbz7D26qQrv70b-BWxYXaQ8g5VKz2oRej4c-ueVxw5lXzLEHVtQMlQUgzAEeKa1el2OvuQ/exec`
- Health was confirmed with `hasCredentials: true` on 2026-04-09 after the user added `KIS_APP_KEY` and `KIS_APP_SECRET`.

### Realtime relay

- File: [server.mjs](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/realtime-relay/server.mjs)
- Purpose: receive KIS realtime websocket data and forward it to the browser via SSE
- Reason: the deployed frontend is HTTPS on GitHub Pages, while KIS official realtime examples currently use `ws://ops.koreainvestment.com:21000/...`, which browsers cannot directly use from an HTTPS page
- Deployment helper:
  - [package.json](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/package.json)
  - [render.yaml](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/render.yaml)
  - [realtime-relay/README.md](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/realtime-relay/README.md)

## Current State

- Frontend is deployed on GitHub Pages.
- Apps Script REST gateway is deployed and reachable.
- `config.js` has the gateway URL set.
- `config.js` now sets `realtimeUrl` to `https://oo-l347.onrender.com/stream`.
- Realtime relay is deployed on Render: `https://oo-l347.onrender.com`.
- Stock slot UI now starts at 1 slot but supports user-adjustable range 1~7 from the page control.
- Month-series UI is currently narrowed to the most recent 5 trading days (easy to restore by changing the configured window constants).
- Gateway supports a `DATA_SOURCE=SHEET` mode to read equal-rate rows from a Google Spreadsheet instead of KIS API calls.
- In `DATA_SOURCE=SHEET`, frontend can call `sheet-sync-targets` to push selected tickers into sheet input cells before month reads.
- Gateway `health` now returns sheet debug metadata (`spreadsheetId`, configured/resolved sheet name) for deployment validation.
- SHEET mode parser supports percent cells (e.g., `3.06%`) and short date strings (`04-09`, `04/09`) in sheet rows.
- Frontend logic already supports:
  - realtime relay via SSE when `realtimeUrl` exists
  - REST fallback if the relay is absent or fails

## Important Technical Findings

### KIS rate-limit issue

On 2026-04-09, real data requests began failing with the KIS message equivalent to:

- `초당 거래건수를 초과하였습니다.`

The user then provided an important KIS notice:

- Since 2026-04-03 17:00 KST, newly registered Open API customers are limited to 3 requests per second for 3 days
- After 3 days, the limit is raised automatically
- Mock trading is excluded

This explains why initial burst loads were failing even after earlier polling reduction.

### Mitigations already implemented

1. Polling reduction:
   - Earlier work changed live polling so monthly series are not reloaded every 5 seconds.
2. Realtime-first path:
   - The app now prefers realtime relay during open-market sessions.
3. Initial burst throttling:
   - Gateway requests are now spaced sequentially instead of firing all targets at once.
   - During open sessions, if `realtimeUrl` exists, the app skips the initial intraday REST snapshot burst and waits for the realtime stream.
4. Gateway client retry pacing:
   - Frontend gateway calls now apply per-request pacing and retry with backoff when rate-limit messages are returned.
5. Gateway month action call reduction:
   - Apps Script monthly handlers now reuse the current-month holiday set when determining series end date, removing an extra previous-month holiday API fetch per request.
6. Apps Script KIS global pacing + retry:
   - KIS GET calls are now globally spaced in script properties and retried with backoff when rate-limit responses are detected.

## Recent Commits

- `9e408f8` Add realtime websocket relay for live updates
- `faff5fb` Throttle initial live requests for new KIS limits
- `98a2677` Add default start script for free hosting

## Validation Completed

On 2026-04-09:

- `app.js` syntax check passed
- `realtime-relay/server.mjs` syntax check passed
- local relay `/health` returned `200`
- local relay health showed `hasCredentials: false` locally, which is expected without local env vars

On 2026-04-10 (Render production):

- Render relay deploy completed at `https://oo-l347.onrender.com`
- `/health` response confirmed `ok: true` and `hasCredentials: true`

## Exact Next Actions

The next agent should continue with these steps in order:

1. Verify GitHub Pages uses the latest `config.js` with relay URL:
   - `realtimeUrl: https://oo-l347.onrender.com/stream`
2. Verify the public site behavior during market hours:
   - site loads
   - today row updates from relay
   - relay failure triggers REST fallback
3. Monitor Render free instance cold-start behavior and decide if paid upgrade is needed
4. Keep `CODEX_CONTEXT.md` and `SESSION_LOG.md` updated after each verification session

## If Continuing In Web Codex

Use this repository as the context source. Start by reading:

1. `AGENTS.md`
2. `CODEX_CONTEXT.md`
3. `SESSION_LOG.md`

The user should not need to re-explain the project if those files are current.
