# Stock Lab

기존 `isarich`와 분리된 별도 주식 앱입니다.

핵심 파일:

- 화면: [index.html](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/index.html)
- 프론트 로직: [app.js](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/app.js)
- 스타일: [styles.css](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/styles.css)
- 프론트 설정: [config.js](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/config.js)
- Apps Script 게이트웨이: [stock-eq-gateway.gs](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/apps-script/stock-eq-gateway.gs)
- 실시간 relay: [server.mjs](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/realtime-relay/server.mjs)

저장소:

- GitHub: [vivaca86/oo](https://github.com/vivaca86/oo)
- GitHub Pages: [https://vivaca86.github.io/oo/](https://vivaca86.github.io/oo/)

## 데이터 구조

- 월간 히스토리, 종목 검색, 휴장일: Apps Script 게이트웨이
- 장중 실시간: realtime relay가 KIS 웹소켓을 받아서 SSE로 전달
- relay가 없으면 장중은 REST fallback

## 왜 relay가 필요한가

한국투자 공식 실시간 웹소켓은 현재 `ws://ops.koreainvestment.com:21000` 기준입니다.  
배포된 앱은 GitHub Pages의 `https://` 페이지라서 브라우저가 `ws://`에 직접 붙을 수 없습니다.  
그래서 실시간은 별도 relay 서버가 필요합니다.

세부 설명:

- [realtime-relay/README.md](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/realtime-relay/README.md)

## 빠른 실행

1. Apps Script 게이트웨이를 배포합니다.
2. [config.js](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/config.js)에 `gatewayUrl`을 넣습니다.
3. 실시간까지 쓰려면 relay 서버를 배포하고 `realtimeUrl`도 넣습니다.

예시:

```js
window.STOCK_LAB_CONFIG = {
    gatewayUrl: "https://script.google.com/macros/s/...",
    realtimeUrl: "https://your-relay-domain/stream"
};
```

## Apps Script 배포 도구

- 루트 실행: [deploy-backend.ps1](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/deploy-backend.ps1)
- 게이트웨이 설명: [README.md](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/apps-script/README.md)
