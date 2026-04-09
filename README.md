# Stock Lab

이 폴더는 기존 `isarich`와 완전히 분리된 별도 주식 앱입니다.

확인할 화면:

- [index.html](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/index.html)

정적 배포 저장소:

- [vivaca86/oo](https://github.com/vivaca86/oo)

실데이터 연결 설정:

- [config.js](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/config.js)

Apps Script 게이트웨이:

- [stock-eq-gateway.gs](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/apps-script/stock-eq-gateway.gs)

게이트웨이 배포 도구:

- [deploy-backend.ps1](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/deploy-backend.ps1)
- [README.md](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/apps-script/README.md)

빠른 배포:

1. Node.js를 설치합니다.
2. 루트에서 `powershell -ExecutionPolicy Bypass -File .\deploy-backend.ps1 -Login` 를 실행합니다.
3. Apps Script 프로젝트에 `KIS_APP_KEY`, `KIS_APP_SECRET` Script Properties를 넣습니다.
4. 다시 `powershell -ExecutionPolicy Bypass -File .\deploy-backend.ps1` 를 실행합니다.
