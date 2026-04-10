# Stock Equal-Rate Gateway

`stock-eq-gateway.gs` is an Apps Script web app backend for [index.html](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/index.html).

It exposes eight GET actions:

- `action=health`
- `action=stock-catalog&market=KOSPI`
- `action=stock-search&q=삼성전자`
- `action=equity-month&ticker=005930&date=2026-04-09`
- `action=intraday-snapshot&ticker=005930&date=2026-04-09`
- `action=index-month&indexCode=0001&date=2026-04-09`
- `action=index-snapshot&indexCode=0001&date=2026-04-09`
- `action=sheet-sync-targets&tickers=005930,000660,...` (SHEET 모드에서 B2/C2~I2 티커 동기화)

`action=health` 응답에는 `dataSource` 및 `sheet`(연결된 스프레드시트 ID/시트명 디버그 정보)가 포함됩니다.

SHEET 모드 시트 값 파싱 참고:
- 날짜 컬럼: `yyyy-mm-dd`, `yyyymmdd`, `mm-dd`, `mm/dd` 지원
- 등가률 컬럼: `0.0306` 또는 `3.06%` 형식 모두 지원

## What It Does

- Resolves stock names to codes using the official KIS master files.
- Returns KOSPI catalog entries so the frontend can use a full datalist.
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
- `DATA_SOURCE`: optional, default `KIS` (`SHEET`로 설정하면 스프레드시트 값 사용)
- `SHEET_SPREADSHEET_ID`: `DATA_SOURCE=SHEET`일 때 필수
- `SHEET_NAME`: `DATA_SOURCE=SHEET`일 때 선택(비우면 첫 번째 시트 사용)

## Deploy

Files:

- [appsscript.json](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/apps-script/appsscript.json)
- [.claspignore](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/apps-script/.claspignore)
- [deploy-gateway.ps1](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/apps-script/tools/deploy-gateway.ps1)

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-backend.ps1 -Login
```

What it does:

1. Logs into `clasp` if needed.
2. Creates a standalone Apps Script project if `.clasp.json` does not exist yet.
3. Pushes [stock-eq-gateway.gs](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/apps-script/stock-eq-gateway.gs) and [appsscript.json](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/apps-script/appsscript.json).
4. Creates or updates a web-app deployment.
5. Saves the deployment URL into [config.js](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/config.js).

Still manual once:

- Open the Apps Script project.
- Set `KIS_APP_KEY` and `KIS_APP_SECRET`.
- Run the deploy command once more.

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
