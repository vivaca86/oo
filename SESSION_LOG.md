# Session Log

## 2026-04-09

### Project split and deployment setup

- Created a completely separate `stock-lab` project outside the old `isarich` folder.
- Pushed the stock-lab project to GitHub repo `vivaca86/oo`.
- GitHub Pages frontend was set up at `https://vivaca86.github.io/oo/`.

### Apps Script gateway

- Built and deployed the Apps Script REST gateway.
- Public exec URL became:
  `https://script.google.com/macros/s/AKfycbxcQXuOXziWYz7eltmG3dN6Pvu3fJWD2S1zakTehM_vA2ubyyIxLelEe6dneyWZi3H2/exec`
- User approved Apps Script API and permissions.
- User added `KIS_APP_KEY` and `KIS_APP_SECRET`.
- Health check then confirmed `hasCredentials: true`.

### Rate-limit diagnosis

- Real KIS requests started failing with `초당 거래건수를 초과하였습니다.`
- User shared the KIS notice saying new API users are limited to `3 requests/second for 3 days` after signup.
- This explained the remaining failures during initial burst loads.

### Frontend logic changes

- Reduced live REST pressure so monthly series are not reloaded every 5 seconds.
- Added sequential request spacing for initial and fallback intraday loads.
- Added logic to skip the initial open-session snapshot burst when realtime relay is configured.

### Realtime relay

- Added a Node-based realtime relay that:
  - requests KIS websocket approval key
  - connects to KIS realtime websocket
  - subscribes to:
    - stock trades via `H0STCNT0`
    - KOSPI index trades via `H0UPCNT0`
  - forwards snapshots to the browser via SSE
- Added:
  - `package.json`
  - `render.yaml`
  - `realtime-relay/server.mjs`
  - `realtime-relay/README.md`

### Verification

- `app.js` syntax check passed
- `server.mjs` syntax check passed
- local relay `/health` returned `200`

### Blocker left open

- The realtime relay still needs to be deployed to a free public host.
- `config.js` still has `realtimeUrl: ""`

### Next step

- Deploy the relay on Render free tier
- Set `KIS_APP_KEY` and `KIS_APP_SECRET` in Render
- Update `config.js` `realtimeUrl`
- Push and verify public live updates

## 2026-04-10

### Realtime relay deployment completed

- Deployed realtime relay to Render free web service.
- Production relay URL: `https://oo-l347.onrender.com`
- `/health` checked in browser and confirmed `ok: true`, `hasCredentials: true`.

### Frontend config

- Updated `config.js` `realtimeUrl` to `https://oo-l347.onrender.com/stream`.

### Verified

- Render deployment status showed successful build.
- Relay health endpoint responded with JSON and credentials enabled.

### Blockers

- None at deployment step.

### Next step

- Push latest commit and confirm GitHub Pages serves updated `config.js`.
- Verify live market updates and fallback behavior from the public site.

### Slot control and monthly header summary refinement

- User feedback: fixed-slot UX felt limiting and slot header needed clearer monthly aggregate meaning.
- Added slot-count selector in UI (`3~7`) so visible stock columns can be adjusted without code changes.
- Kept default visible slots at 3, but expanded runtime support to 7 with state persistence.
- Updated slot secondary text to show monthly equal-rate aggregate range and value (e.g., `4/1~4/10`).

### Verification

- `node --check app.js` passed after slot-count/state updates.
- `node --check realtime-relay/server.mjs` passed (no regressions in relay path changes).

### Next step

- Confirm GitHub Pages reflects slot selector and monthly aggregate labels in production UI.

### Gateway rate-limit handling hardening

- User reported intermittent `초당 거래건수를 초과하였습니다.` even with a small slot count.
- Added gateway client-side pacing and rate-limit-aware retries with backoff in frontend adapter logic.
- Goal: reduce transient load failures by spacing calls more conservatively and retrying automatically on rate-limit responses.

### Slot minimization + KOSPI monthly aggregate

- On additional user request, lowered minimum/default slot count to `1` for aggressive load reduction tests.
- Expanded slot-count selector range to `1~7`.
- Added KOSPI header monthly equal-rate aggregate text to match stock slot aggregate display.

### Apps Script month handler optimization for rate limits

- User still hit `초당 거래건수를 초과하였습니다.` even with 1 slot.
- Reduced KIS API usage in month handlers by removing extra boundary holiday fetch when resolving series end date.
- `handleEquityMonth_` / `handleIndexMonth_` now reuse the already-fetched current-month holiday list for session/date resolution.

### Temporary display/data window reduction (5 trading days)

- User requested reducing month-range loading to a 5-business-day window first.
- Added gateway-side row limiting with baseline preservation so returned month rows are clipped to the latest 5 trading days.
- Updated frontend header/description text and aggregate labels to show `최근 5영업일` semantics.
- Kept the change reversible by using explicit constants (`tradingDayWindow`, `DISPLAY_TRADING_DAY_WINDOW`).

### Apps Script KIS call serialization + retry

- User still reported rate-limit failures even at 2 slots / 5-day mode.
- Added script-level KIS request spacing (`kisMinIntervalMs`) with lock+property timestamp so concurrent executions do not burst-request KIS.
- Added rate-limit-aware retry delays (`kisRetryDelaysMs`) for KIS GET calls.

### Spreadsheet data-source fallback mode

- User indicated KIS API path is still unreliable and requested switching to spreadsheet-driven values.
- Added `DATA_SOURCE=SHEET` mode in Apps Script gateway.
- Added script property support:
  - `SHEET_SPREADSHEET_ID` (required in SHEET mode)
  - `SHEET_NAME` (optional, defaults to first sheet)
- In SHEET mode, month handlers now read date + target column equal-rate values from sheet and build response rows without KIS calls.
- Added `sheet-sync-targets` action so frontend-selected stock tickers can be written to `B2/C2~I2` flow before reading sheet-driven equal rates.
- Added health debug payload (`dataSource`, configured/resolved sheet info) so users can verify which spreadsheet/sheet is actually connected.

### Apps Script redeploy URL update

- User provided a newly deployed Apps Script web-app URL.
- Updated frontend `config.js` `gatewayUrl` to the new `/exec` URL.
- Updated `CODEX_CONTEXT.md` public exec URL reference to match the redeploy.

### Apps Script redeploy URL update (second)

- User confirmed a newer Apps Script deploy URL and requested switching frontend gateway to that URL.
- Updated `config.js` and `CODEX_CONTEXT.md` to the new `/exec` endpoint.
