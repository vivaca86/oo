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

