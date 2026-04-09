# Realtime Relay

이 서버는 한국투자 실시간 웹소켓을 받아서 브라우저에는 `SSE`로 전달합니다.

왜 필요한가:

- 한국투자 공식 실시간 주소는 현재 `ws://ops.koreainvestment.com:21000` 형태입니다.
- 배포된 프론트는 GitHub Pages의 `https://` 페이지라서 브라우저가 `ws://`에 직접 붙을 수 없습니다.
- 그래서 중간 relay 서버가 KIS `ws://`를 받고, 브라우저에는 `https://relay-domain/stream`으로 흘려줘야 합니다.

## 환경변수

```text
KIS_APP_KEY=실전 App Key
KIS_APP_SECRET=실전 App Secret
PORT=8787
```

선택값:

```text
HOST=0.0.0.0
KIS_BASE_URL=https://openapi.koreainvestment.com:9443
KIS_WS_URL=ws://ops.koreainvestment.com:21000/tryitout
SUBSCRIBE_DELAY_MS=80
SSE_KEEPALIVE_MS=15000
MAX_CODES=8
```

## 실행

```bash
npm install
npm run relay
```

정상 실행 후 확인:

- `GET /health`
- `GET /stream?codes=0001,005930,000660&date=2026-04-09`

## 프론트 연결

루트의 [config.js](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/config.js)에 relay 주소를 넣으면 됩니다.

```js
window.STOCK_LAB_CONFIG = {
    gatewayUrl: "https://script.google.com/macros/s/...",
    realtimeUrl: "https://your-relay-domain/stream"
};
```

앱은 장중에 `realtimeUrl`이 있으면 SSE stream을 우선 쓰고, 실패하면 기존 REST 폴링으로 자동 fallback 합니다.
