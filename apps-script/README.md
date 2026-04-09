# Stock Equal-Rate Gateway

`stock-eq-gateway.gs` is an Apps Script web app backend for [index.html](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/index.html).

It exposes six GET actions:

- `action=health`
- `action=stock-search&q=삼성전자`
- `action=equity-month&ticker=005930&date=2026-04-09`
- `action=intraday-snapshot&ticker=005930&date=2026-04-09`
- `action=index-month&indexCode=0001&date=2026-04-09`
- `action=index-snapshot&indexCode=0001&date=2026-04-09`

## What It Does

- Resolves stock names to codes using the official KIS master files.
- Loads monthly daily closes for both the selected stock and KOSPI.
- Returns a `baselineClose` from the previous trading day before month start.
- Returns only trading-day rows, so weekends and holidays do not appear in the table.
- Caches holiday data because the official `chk-holiday` API is intended to be called sparingly.
- Returns a lightweight live snapshot for today so the frontend can poll during market hours.

## Script Properties

Set these in Apps Script under `Project Settings -> Script Properties`.

- `KIS_APP_KEY`: required
- `KIS_APP_SECRET`: required
- `KIS_BASE_URL`: optional, default `https://openapi.koreainvestment.com:9443`
- `KIS_MARKET_DIV`: optional, default `J`
- `KIS_ORG_ADJ_PRC`: optional, default `1`

## Deploy

1. Create a new Apps Script project.
2. Paste the contents of [stock-eq-gateway.gs](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/apps-script/stock-eq-gateway.gs) into the project.
3. Save the script properties above.
4. Deploy it as a Web App.
5. Use `Execute as: Me`.
6. Use `Who has access: Anyone` or a scope that matches where you will load the prototype.
7. Copy the `/exec` URL.
8. Put that URL into [config.js](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/config.js).

## Response Shape

### `equity-month`

```json
{
  "ok": true,
  "stock": { "code": "005930", "name": "삼성전자", "market": "KOSPI" },
  "selectedDate": "2026-04-09",
  "lastTradingDate": "2026-04-08",
  "baselineDate": "2026-03-31",
  "baselineClose": 187600,
  "rows": [
    { "date": "2026-04-01", "close": 189650 }
  ],
  "holidays": ["2026-04-10"],
  "source": "kis-open-api"
}
```

### `index-month`

```json
{
  "ok": true,
  "stock": { "code": "0001", "name": "KOSPI", "market": "INDEX", "assetType": "index" },
  "selectedDate": "2026-04-09",
  "lastTradingDate": "2026-04-08",
  "baselineDate": "2026-03-31",
  "baselineClose": 2468.11,
  "rows": [
    { "date": "2026-04-01", "close": 2480.21 }
  ],
  "holidays": ["2026-04-10"],
  "source": "kis-open-api"
}
```

### `intraday-snapshot` / `index-snapshot`

```json
{
  "ok": true,
  "date": "2026-04-09",
  "price": 204000,
  "prevClose": 210500,
  "equalRate": -0.0309,
  "asOf": "2026-04-09T10:14:35+09:00",
  "session": "open",
  "source": "kis-open-api"
}
```

## Notes

- This prototype uses polling, not websockets.
- The frontend currently polls every 5 seconds when `session === open`.
- If you want true tick-level live updates later, the next step is a websocket-capable backend.
