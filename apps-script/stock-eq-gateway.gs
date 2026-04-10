var STOCK_EQ_GATEWAY = {
  gatewayVersion: '2026-04-10.1',
  healthSchemaVersion: 2,
  timezone: 'Asia/Seoul',
  defaultBaseUrl: 'https://openapi.koreainvestment.com:9443',
  defaultMarketDiv: 'J',
  defaultAdjustedPriceFlag: '1',
  tokenSkewMs: 120000,
  catalogCacheHours: 24,
  holidayCacheHours: 24,
  cacheChunkSize: 8000,
  tradingDayWindow: 5,
  kisMinIntervalMs: 450,
  kisRetryDelaysMs: [900, 1600],
  recentHistoryLookbackDays: 10,
  propertyPrefix: 'stock_eq_gateway_v1',
  masterSources: [
    {
      market: 'KOSPI',
      url: 'https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip',
      fileName: 'kospi_code.mst',
      tailLength: 228
    },
    {
      market: 'KOSDAQ',
      url: 'https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip',
      fileName: 'kosdaq_code.mst',
      tailLength: 222
    },
    {
      market: 'KONEX',
      url: 'https://new.real.download.dws.co.kr/common/master/konex_code.mst.zip',
      fileName: 'konex_code.mst',
      tailLength: 184
    }
  ]
};

function doGet(e) {
  try {
    var params = e && e.parameter ? e.parameter : {};
    var action = String(params.action || 'health').trim();
    var payload = routeGatewayAction_(action, params);
    return jsonResponse_(payload);
  } catch (error) {
    return jsonResponse_(buildErrorResponse_(error));
  }
}

function routeGatewayAction_(action, params) {
  switch (action) {
    case 'health':
      return handleHealth_();
    case 'stock-catalog':
      return handleStockCatalog_(params);
    case 'stock-search':
      return handleStockSearch_(params);
    case 'sheet-sync-targets':
      return handleSheetSyncTargets_(params);
    case 'equity-month':
      return handleEquityMonth_(params);
    case 'index-month':
      return handleIndexMonth_(params);
    case 'intraday-snapshot':
      return handleIntradaySnapshot_(params);
    case 'index-snapshot':
      return handleIndexSnapshot_(params);
    default:
      throw createHttpError_(400, '지원하지 않는 action 입니다: ' + action);
  }
}

function handleStockCatalog_(params) {
  var market = String(params.market || 'KOSPI').trim().toUpperCase();
  var catalog = getStockCatalog_();
  var items = [];

  for (var i = 0; i < catalog.length; i += 1) {
    var item = catalog[i];
    if (market === 'ALL' || String(item.market || '').toUpperCase() === market) {
      items.push(item);
    }
  }

  return {
    ok: true,
    market: market,
    items: items,
    source: 'kis-master'
  };
}

function handleHealth_() {
  var dataSource = String(getSetting_('DATA_SOURCE', 'KIS')).trim().toUpperCase() || 'KIS';
  var sheetInfo = getSheetDebugInfo_(dataSource);
  return {
    ok: true,
    service: 'stock-eq-gateway',
    gatewayVersion: STOCK_EQ_GATEWAY.gatewayVersion,
    healthSchemaVersion: STOCK_EQ_GATEWAY.healthSchemaVersion,
    now: formatKstTimestamp_(new Date()),
    hasCredentials: Boolean(getSetting_('KIS_APP_KEY', '') && getSetting_('KIS_APP_SECRET', '')),
    dataSource: dataSource,
    sheet: sheetInfo
  };
}

function getSheetDebugInfo_(dataSource) {
  var spreadsheetId = String(getSetting_('SHEET_SPREADSHEET_ID', '')).trim();
  var sheetName = String(getSetting_('SHEET_NAME', '')).trim();
  var info = {
    spreadsheetId: spreadsheetId || null,
    configuredSheetName: sheetName || null
  };
  if (dataSource !== 'SHEET' || !spreadsheetId) {
    return info;
  }
  try {
    var sheet = getConfiguredSheet_();
    info.resolvedSheetName = String(sheet.getName() || '');
    info.resolvedSheetId = sheet.getSheetId();
  } catch (error) {
    info.error = String(error && error.message ? error.message : error);
  }
  return info;
}

function handleStockSearch_(params) {
  var query = String(params.q || params.ticker || '').trim();
  if (!query) {
    return {
      ok: true,
      items: [],
      source: 'kis-master'
    };
  }

  return {
    ok: true,
    items: searchStockCatalog_(query).slice(0, 20),
    source: 'kis-master'
  };
}

function handleEquityMonth_(params) {
  var stock = resolveStock_(params.ticker || params.q || '');
  var selectedDate = coerceIsoDate_(params.date);
  var slotNumber = Number(params.slot || 0);
  if (isSheetDataSourceMode_()) {
    return buildSheetMonthResponse_(stock, selectedDate, slotNumber);
  }
  var monthStart = startOfMonthIso_(selectedDate);
  var holidays = getMonthlyHolidayDates_(selectedDate);
  var historyEndDate = resolveSeriesEndDate_(selectedDate, holidays);
  var rows = fetchDailyCloseRows_(stock.code, addDaysIso_(monthStart, -40), historyEndDate);
  var partition = partitionMonthRows_(rows, monthStart);
  var limited = limitRecentTradingRowsWithBaseline_(partition.rows, partition.baselineDate, partition.baselineClose, STOCK_EQ_GATEWAY.tradingDayWindow);
  var lastTradingDate = inferLastTradingDate_(historyEndDate, monthStart, partition.rows, holidays);

  return {
    ok: true,
    stock: stock,
    selectedDate: selectedDate,
    lastTradingDate: lastTradingDate,
    baselineDate: limited.baselineDate,
    baselineClose: limited.baselineClose,
    rows: limited.rows,
    holidays: holidays,
    source: 'kis-open-api'
  };
}

function handleIndexMonth_(params) {
  var stock = resolveIndexBenchmark_(params.indexCode || params.q || '0001');
  var selectedDate = coerceIsoDate_(params.date);
  if (isSheetDataSourceMode_()) {
    return buildSheetMonthResponse_(stock, selectedDate, 0);
  }
  var monthStart = startOfMonthIso_(selectedDate);
  var holidays = getMonthlyHolidayDates_(selectedDate);
  var historyEndDate = resolveSeriesEndDate_(selectedDate, holidays);
  var rows = fetchIndexDailyRows_(stock.code, historyEndDate);
  var partition = partitionMonthRows_(rows, monthStart);
  var limited = limitRecentTradingRowsWithBaseline_(partition.rows, partition.baselineDate, partition.baselineClose, STOCK_EQ_GATEWAY.tradingDayWindow);
  var lastTradingDate = inferLastTradingDate_(historyEndDate, monthStart, partition.rows, holidays);

  return {
    ok: true,
    stock: stock,
    selectedDate: selectedDate,
    lastTradingDate: lastTradingDate,
    baselineDate: limited.baselineDate,
    baselineClose: limited.baselineClose,
    rows: limited.rows,
    holidays: holidays,
    source: 'kis-open-api'
  };
}

function handleIntradaySnapshot_(params) {
  var stock = resolveStock_(params.ticker || params.q || '');
  var selectedDate = coerceIsoDate_(params.date);
  if (isSheetDataSourceMode_()) {
    return {
      ok: true,
      date: selectedDate,
      price: null,
      prevClose: null,
      equalRate: null,
      asOf: formatKstTimestamp_(new Date()),
      session: 'historical',
      source: 'sheet'
    };
  }
  var holidays = getMonthlyHolidayDates_(selectedDate);
  var session = resolveGatewaySession_(selectedDate, holidays);
  var timestamp = formatKstTimestamp_(new Date());

  if (session === 'historical') {
    return {
      ok: true,
      date: selectedDate,
      price: null,
      prevClose: null,
      equalRate: null,
      asOf: timestamp,
      session: session
    };
  }

  if (session === 'holiday' || session === 'preopen') {
    var previousClose = fetchPreviousCloseBeforeDate_(stock.code, selectedDate);
    return {
      ok: true,
      date: selectedDate,
      price: null,
      prevClose: previousClose,
      equalRate: null,
      asOf: timestamp,
      session: session
    };
  }

  var quote = fetchCurrentQuote_(stock.code);
  var price = firstFiniteNumber_([
    toNumber_(quote.stck_prpr),
    toNumber_(quote.stck_clpr)
  ]);
  var prevClose = resolvePreviousClose_(quote, price);

  if (!isFiniteNumber_(price) && session === 'closed') {
    price = fetchPreviousCloseBeforeDate_(stock.code, addDaysIso_(selectedDate, 1));
    if (!isFiniteNumber_(prevClose)) {
      prevClose = fetchPreviousCloseBeforeDate_(stock.code, selectedDate);
    }
  }

  if (!isFiniteNumber_(price)) {
    throw createHttpError_(502, '현재가 응답에서 가격을 확인하지 못했습니다.');
  }

  return {
    ok: true,
    date: selectedDate,
    price: price,
    prevClose: prevClose,
    equalRate: isFiniteNumber_(price) && isFiniteNumber_(prevClose) && prevClose !== 0
      ? roundNumber_((price / prevClose) - 1, 8)
      : null,
    asOf: timestamp,
    session: session,
    source: 'kis-open-api'
  };
}

function handleIndexSnapshot_(params) {
  var stock = resolveIndexBenchmark_(params.indexCode || params.q || '0001');
  var selectedDate = coerceIsoDate_(params.date);
  if (isSheetDataSourceMode_()) {
    return {
      ok: true,
      date: selectedDate,
      price: null,
      prevClose: null,
      equalRate: null,
      asOf: formatKstTimestamp_(new Date()),
      session: 'historical',
      source: 'sheet'
    };
  }
  var holidays = getMonthlyHolidayDates_(selectedDate);
  var session = resolveGatewaySession_(selectedDate, holidays);
  var timestamp = formatKstTimestamp_(new Date());

  if (session === 'historical') {
    return {
      ok: true,
      date: selectedDate,
      price: null,
      prevClose: null,
      equalRate: null,
      asOf: timestamp,
      session: session
    };
  }

  if (session === 'holiday' || session === 'preopen') {
    var previousClose = fetchPreviousIndexCloseBeforeDate_(stock.code, selectedDate);
    return {
      ok: true,
      date: selectedDate,
      price: null,
      prevClose: previousClose,
      equalRate: null,
      asOf: timestamp,
      session: session
    };
  }

  var quote = fetchIndexCurrentQuote_(stock.code);
  var price = toNumber_(quote.bstp_nmix_prpr);
  var prevClose = resolveIndexPreviousClose_(quote);

  if (!isFiniteNumber_(price) && session === 'closed') {
    price = fetchPreviousIndexCloseBeforeDate_(stock.code, addDaysIso_(selectedDate, 1));
    if (!isFiniteNumber_(prevClose)) {
      prevClose = fetchPreviousIndexCloseBeforeDate_(stock.code, selectedDate);
    }
  }

  if (!isFiniteNumber_(price)) {
    throw createHttpError_(502, '지수 현재가를 확인하지 못했습니다.');
  }

  return {
    ok: true,
    date: selectedDate,
    price: price,
    prevClose: prevClose,
    equalRate: isFiniteNumber_(price) && isFiniteNumber_(prevClose) && prevClose !== 0
      ? roundNumber_((price / prevClose) - 1, 8)
      : null,
    asOf: timestamp,
    session: session,
    source: 'kis-open-api'
  };
}

function resolveIndexBenchmark_(input) {
  var code = sanitizeStockCode_(input || '0001') || '0001';
  if (code === '0001') {
    return { code: '0001', name: 'KOSPI', market: 'INDEX', assetType: 'index' };
  }
  if (code === '1001') {
    return { code: '1001', name: 'KOSDAQ', market: 'INDEX', assetType: 'index' };
  }
  if (code === '2001') {
    return { code: '2001', name: 'KOSPI200', market: 'INDEX', assetType: 'index' };
  }
  throw createHttpError_(400, '지원하지 않는 지수 코드입니다: ' + code);
}

function isSheetDataSourceMode_() {
  return String(getSetting_('DATA_SOURCE', 'KIS')).trim().toUpperCase() === 'SHEET';
}

function handleSheetSyncTargets_(params) {
  if (!isSheetDataSourceMode_()) {
    return {
      ok: true,
      source: 'kis-open-api',
      skipped: true
    };
  }

  var rawTickers = String(params.tickers || '').trim();
  var tickers = rawTickers ? rawTickers.split(',').map(function (value) {
    return sanitizeStockCode_(value);
  }) : [];

  var sheet = getConfiguredSheet_();
  var writeValues = [['0001']];
  for (var i = 0; i < 7; i += 1) {
    writeValues.push([tickers[i] || '']);
  }
  sheet.getRange(2, 2, 1, 8).setValues([[
    writeValues[0][0],
    writeValues[1][0],
    writeValues[2][0],
    writeValues[3][0],
    writeValues[4][0],
    writeValues[5][0],
    writeValues[6][0],
    writeValues[7][0]
  ]]);

  return {
    ok: true,
    source: 'sheet',
    syncedTickers: tickers
  };
}

function buildSheetMonthResponse_(stock, selectedDate, slotNumber) {
  var monthStart = startOfMonthIso_(selectedDate);
  var sheetSeries = loadSheetEqualRateSeries_(stock, selectedDate, slotNumber);
  var partition = partitionMonthRows_(sheetSeries.rows, monthStart);
  var limited = limitRecentTradingRowsWithBaseline_(partition.rows, partition.baselineDate, partition.baselineClose, STOCK_EQ_GATEWAY.tradingDayWindow);
  var lastTradingDate = limited.rows.length ? limited.rows[limited.rows.length - 1].date : selectedDate;

  return {
    ok: true,
    stock: stock,
    selectedDate: selectedDate,
    lastTradingDate: lastTradingDate,
    baselineDate: limited.baselineDate,
    baselineClose: limited.baselineClose,
    rows: limited.rows,
    holidays: [],
    source: 'sheet'
  };
}

function loadSheetEqualRateSeries_(stock, selectedDate, slotNumber) {
  var sheet = getConfiguredSheet_();
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) {
    throw createHttpError_(500, '스프레드시트 데이터가 비어 있습니다.');
  }

  var headers = values[0].map(function (value) { return String(value || '').trim(); });
  var targetColumn = findSheetColumnIndexBySlot_(headers, stock, slotNumber);
  if (targetColumn < 0) {
    throw createHttpError_(400, '시트에서 종목 컬럼을 찾지 못했습니다: ' + (stock.name || stock.code));
  }

  var monthKey = selectedDate.slice(0, 7);
  var equalRateRows = [];
  for (var i = 1; i < values.length; i += 1) {
    var row = values[i];
    var dateIso = parseSheetDateToIso_(row[0]);
    if (!dateIso || dateIso.slice(0, 7) !== monthKey || dateIso > selectedDate) continue;
    var equalRate = toEqualRateNumber_(row[targetColumn]);
    if (!isFiniteNumber_(equalRate)) continue;
    equalRateRows.push({ date: dateIso, equalRate: equalRate });
  }

  equalRateRows.sort(function (left, right) {
    return left.date.localeCompare(right.date);
  });
  if (!equalRateRows.length) {
    return { rows: [] };
  }

  var rows = [];
  var previousClose = 100;
  for (var index = 0; index < equalRateRows.length; index += 1) {
    var item = equalRateRows[index];
    var close = roundNumber_(previousClose * (1 + item.equalRate), 8);
    rows.push({
      date: item.date,
      close: close
    });
    previousClose = close;
  }

  return { rows: rows };
}

function findSheetColumnIndex_(headers, stock) {
  return findSheetColumnIndexBySlot_(headers, stock, 0);
}

function findSheetColumnIndexBySlot_(headers, stock, slotNumber) {
  var safeSlot = Number(slotNumber || 0);
  if (safeSlot > 0) {
    return Math.min(2 + (safeSlot - 1), headers.length - 1);
  }
  var normalizedHeaders = headers.map(function (header) { return normalizeSearchText_(header); });
  var candidates = [];
  if (String(stock.code || '') === '0001' || normalizeSearchText_(stock.name || '') === 'kospi') {
    candidates.push('kospi');
    candidates.push('지수');
  } else {
    candidates.push(normalizeSearchText_(stock.code || ''));
    candidates.push(normalizeSearchText_(stock.name || ''));
  }

  for (var i = 1; i < normalizedHeaders.length; i += 1) {
    for (var j = 0; j < candidates.length; j += 1) {
      var keyword = candidates[j];
      if (!keyword) continue;
      if (normalizedHeaders[i] === keyword || normalizedHeaders[i].indexOf(keyword) >= 0) {
        return i;
      }
    }
  }
  return -1;
}

function getConfiguredSheet_() {
  var spreadsheetId = String(getSetting_('SHEET_SPREADSHEET_ID', '')).trim();
  if (!spreadsheetId) {
    throw createHttpError_(500, 'DATA_SOURCE=SHEET 인 경우 SHEET_SPREADSHEET_ID 를 설정해 주세요.');
  }

  var sheetName = String(getSetting_('SHEET_NAME', '')).trim();
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheet = sheetName ? spreadsheet.getSheetByName(sheetName) : spreadsheet.getSheets()[0];
  if (!sheet) {
    throw createHttpError_(500, '설정한 SHEET_NAME 시트를 찾지 못했습니다.');
  }
  return sheet;
}

function parseSheetDateToIso_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, STOCK_EQ_GATEWAY.timezone, 'yyyy-MM-dd');
  }
  var raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) return basicToIso_(raw);
  if (/^\d{1,2}-\d{1,2}$/.test(raw)) {
    var year = todayIsoKst_().slice(0, 4);
    var parts = raw.split('-');
    var month = ('0' + Number(parts[0])).slice(-2);
    var day = ('0' + Number(parts[1])).slice(-2);
    return year + '-' + month + '-' + day;
  }
  if (/^\d{1,2}\/\d{1,2}$/.test(raw)) {
    var yearSlash = todayIsoKst_().slice(0, 4);
    var slashParts = raw.split('/');
    var slashMonth = ('0' + Number(slashParts[0])).slice(-2);
    var slashDay = ('0' + Number(slashParts[1])).slice(-2);
    return yearSlash + '-' + slashMonth + '-' + slashDay;
  }
  return null;
}

function toEqualRateNumber_(value) {
  if (value === null || value === undefined || value === '') return null;
  var raw = String(value).trim();
  var hasPercent = raw.indexOf('%') >= 0;
  var parsed = Number(raw.replace(/,/g, '').replace(/%/g, ''));
  if (!isFiniteNumber_(parsed)) return null;
  if (hasPercent) {
    return parsed / 100;
  }
  if (Math.abs(parsed) > 1) {
    return parsed / 100;
  }
  return parsed;
}

function resolveStock_(input) {
  var raw = String(input || '').trim();
  if (!raw) {
    throw createHttpError_(400, 'ticker 또는 q 파라미터가 필요합니다.');
  }

  var exactCode = sanitizeStockCode_(raw);
  if (exactCode) {
    var catalog = getStockCatalog_();
    for (var i = 0; i < catalog.length; i += 1) {
      if (catalog[i].code === exactCode) {
        return catalog[i];
      }
    }
    if (/^[A-Z0-9]{6,9}$/.test(exactCode)) {
      return {
        code: exactCode,
        name: raw,
        market: 'KRX'
      };
    }
  }

  var matches = searchStockCatalog_(raw);
  if (matches.length) {
    return matches[0];
  }

  throw createHttpError_(404, '종목을 찾지 못했습니다: ' + raw);
}

function searchStockCatalog_(query) {
  var catalog = getStockCatalog_();
  var normalized = normalizeSearchText_(query);
  if (!normalized) return [];

  var directMatches = searchStockCatalogNormalized_(catalog, normalized);
  if (directMatches.length) {
    return directMatches;
  }

  for (var end = normalized.length - 1; end >= 2; end -= 1) {
    var fallbackQuery = normalized.slice(0, end);
    var fallbackMatches = searchStockCatalogNormalized_(catalog, fallbackQuery);
    if (fallbackMatches.length) {
      return fallbackMatches;
    }
  }

  return [];
}

function searchStockCatalogNormalized_(catalog, normalized) {
  if (!normalized) return [];

  var exact = [];
  var prefix = [];
  var contains = [];

  for (var i = 0; i < catalog.length; i += 1) {
    var item = catalog[i];
    var codeKey = normalizeSearchText_(item.code);
    var nameKey = normalizeSearchText_(item.name);
    var marketKey = normalizeSearchText_(item.market);

    if (codeKey === normalized || nameKey === normalized) {
      exact.push(item);
      continue;
    }

    if (codeKey.indexOf(normalized) === 0 || nameKey.indexOf(normalized) === 0) {
      prefix.push(item);
      continue;
    }

    if (codeKey.indexOf(normalized) >= 0 || nameKey.indexOf(normalized) >= 0 || marketKey.indexOf(normalized) >= 0) {
      contains.push(item);
    }
  }

  return dedupeByCode_(exact.concat(prefix, contains));
}

function getStockCatalog_() {
  var cacheKey = 'catalog';
  var cached = loadCachedValue_(cacheKey);
  if (cached && Array.isArray(cached.items)) {
    return cached.items;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    cached = loadCachedValue_(cacheKey);
    if (cached && Array.isArray(cached.items)) {
      return cached.items;
    }

    var items = buildStockCatalog_();
    saveCachedValue_(cacheKey, { items: items }, STOCK_EQ_GATEWAY.catalogCacheHours);
    return items;
  } finally {
    lock.releaseLock();
  }
}

function buildStockCatalog_() {
  var allItems = [];
  var seen = {};

  for (var i = 0; i < STOCK_EQ_GATEWAY.masterSources.length; i += 1) {
    var source = STOCK_EQ_GATEWAY.masterSources[i];
    var response = UrlFetchApp.fetch(source.url, {
      muteHttpExceptions: true,
      followRedirects: true
    });

    if (response.getResponseCode() >= 400) {
      throw createHttpError_(502, '종목 마스터 다운로드에 실패했습니다: ' + source.market);
    }

    var files = Utilities.unzip(response.getBlob());
    var masterBlob = findUnzippedBlob_(files, source.fileName);
    if (!masterBlob) {
      throw createHttpError_(502, '압축 해제된 마스터 파일을 찾지 못했습니다: ' + source.fileName);
    }

    var marketItems = parseMasterBlob_(masterBlob, source.market, source.tailLength);
    for (var j = 0; j < marketItems.length; j += 1) {
      var item = marketItems[j];
      if (seen[item.code]) continue;
      seen[item.code] = true;
      allItems.push(item);
    }
  }

  allItems.sort(function (left, right) {
    var nameCompare = left.name.localeCompare(right.name);
    if (nameCompare !== 0) return nameCompare;
    return left.code.localeCompare(right.code);
  });

  return allItems;
}

function parseMasterBlob_(blob, market, tailLength) {
  var text = decodeKoreanBlob_(blob);
  var lines = text.split(/\r?\n/);
  var items = [];

  for (var i = 0; i < lines.length; i += 1) {
    var line = String(lines[i] || '').replace(/\u0000/g, '');
    if (!line || line.length <= tailLength + 21) continue;

    var prefix = line.slice(0, line.length - tailLength);
    var code = sanitizeStockCode_(prefix.slice(0, 9));
    var name = String(prefix.slice(21) || '').trim();
    if (!code || !name) continue;

    items.push({
      code: code,
      name: name,
      market: market
    });
  }

  return items;
}

function decodeKoreanBlob_(blob) {
  var charsets = ['CP949', 'MS949', 'EUC-KR', 'UTF-8'];
  for (var i = 0; i < charsets.length; i += 1) {
    try {
      return blob.getDataAsString(charsets[i]);
    } catch (error) {
      // Try next charset.
    }
  }
  return blob.getDataAsString();
}

function findUnzippedBlob_(files, fileName) {
  for (var i = 0; i < files.length; i += 1) {
    if (String(files[i].getName() || '') === fileName) {
      return files[i];
    }
  }
  return files.length ? files[0] : null;
}

function fetchDailyCloseRows_(ticker, startDateIso, endDateIso) {
  var json = callKisGet_(
    '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
    'FHKST03010100',
    {
      FID_COND_MRKT_DIV_CODE: getSetting_('KIS_MARKET_DIV', STOCK_EQ_GATEWAY.defaultMarketDiv),
      FID_INPUT_ISCD: sanitizeStockCode_(ticker),
      FID_INPUT_DATE_1: isoToBasic_(startDateIso),
      FID_INPUT_DATE_2: isoToBasic_(endDateIso),
      FID_PERIOD_DIV_CODE: 'D',
      FID_ORG_ADJ_PRC: getSetting_('KIS_ORG_ADJ_PRC', STOCK_EQ_GATEWAY.defaultAdjustedPriceFlag)
    }
  );

  var output = Array.isArray(json.output2) ? json.output2 : [];
  var rows = output
    .map(function (item) {
      return {
        date: basicToIso_(item.stck_bsop_date),
        close: toNumber_(item.stck_clpr)
      };
    })
    .filter(function (item) {
      return item.date && isFiniteNumber_(item.close);
    });

  rows.sort(function (left, right) {
    return left.date.localeCompare(right.date);
  });

  return rows;
}

function fetchRecentCloseRows_(ticker, selectedDate) {
  return fetchDailyCloseRows_(
    ticker,
    addDaysIso_(selectedDate, -1 * STOCK_EQ_GATEWAY.recentHistoryLookbackDays),
    selectedDate
  );
}

function fetchCurrentQuote_(ticker) {
  var json = callKisGet_(
    '/uapi/domestic-stock/v1/quotations/inquire-price',
    'FHKST01010100',
    {
      FID_COND_MRKT_DIV_CODE: getSetting_('KIS_MARKET_DIV', STOCK_EQ_GATEWAY.defaultMarketDiv),
      FID_INPUT_ISCD: sanitizeStockCode_(ticker)
    }
  );

  return json.output || {};
}

function fetchIndexCurrentQuote_(indexCode) {
  var json = callKisGet_(
    '/uapi/domestic-stock/v1/quotations/inquire-index-price',
    'FHPUP02100000',
    {
      FID_COND_MRKT_DIV_CODE: 'U',
      FID_INPUT_ISCD: sanitizeStockCode_(indexCode)
    }
  );

  return json.output || {};
}

function fetchIndexDailyRows_(indexCode, endDateIso) {
  var json = callKisGet_(
    '/uapi/domestic-stock/v1/quotations/inquire-index-daily-price',
    'FHPUP02120000',
    {
      FID_PERIOD_DIV_CODE: 'D',
      FID_COND_MRKT_DIV_CODE: 'U',
      FID_INPUT_ISCD: sanitizeStockCode_(indexCode),
      FID_INPUT_DATE_1: isoToBasic_(endDateIso)
    }
  );

  var output = Array.isArray(json.output2) ? json.output2 : [];
  var rows = output
    .map(function (item) {
      return {
        date: basicToIso_(item.stck_bsop_date),
        close: toNumber_(item.bstp_nmix_prpr)
      };
    })
    .filter(function (item) {
      return item.date && isFiniteNumber_(item.close);
    });

  rows.sort(function (left, right) {
    return left.date.localeCompare(right.date);
  });

  return rows;
}

function fetchPreviousCloseBeforeDate_(ticker, dateIso) {
  var rows = fetchDailyCloseRows_(ticker, addDaysIso_(dateIso, -40), addDaysIso_(dateIso, -1));
  return rows.length ? rows[rows.length - 1].close : null;
}

function fetchPreviousIndexCloseBeforeDate_(indexCode, dateIso) {
  var rows = fetchIndexDailyRows_(indexCode, addDaysIso_(dateIso, -1));
  var filtered = rows.filter(function (row) {
    return row.date < dateIso;
  });
  return filtered.length ? filtered[filtered.length - 1].close : null;
}

function getMonthlyHolidayDates_(dateIso) {
  var monthKey = dateIso.slice(0, 7);
  var cacheKey = 'holidays:' + monthKey;
  var cached = loadCachedValue_(cacheKey);
  if (cached && Array.isArray(cached.days)) {
    return cached.days;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    cached = loadCachedValue_(cacheKey);
    if (cached && Array.isArray(cached.days)) {
      return cached.days;
    }

    var holidayRecords = fetchHolidayRecords_(isoToBasic_(dateIso));
    var days = holidayRecords
      .map(function (item) {
        return {
          date: basicToIso_(item.bass_dt),
          isTradingDay: String(item.tr_day_yn || '').toUpperCase() === 'Y',
          isOpenDay: String(item.opnd_yn || '').toUpperCase() === 'Y'
        };
      })
      .filter(function (item) {
        return item.date && item.date.indexOf(monthKey) === 0 && (!item.isTradingDay || !item.isOpenDay);
      })
      .map(function (item) {
        return item.date;
      });

    var uniqueDays = uniqueStrings_(days).sort();
    saveCachedValue_(cacheKey, { days: uniqueDays }, STOCK_EQ_GATEWAY.holidayCacheHours);
    return uniqueDays;
  } finally {
    lock.releaseLock();
  }
}

function fetchHolidayRecords_(baseDateBasic) {
  var records = [];
  var params = {
    BASS_DT: baseDateBasic,
    CTX_AREA_FK: '',
    CTX_AREA_NK: ''
  };
  var trContHeader = '';

  for (var page = 0; page < 20; page += 1) {
    var response = callKisGetWithHeaders_(
      '/uapi/domestic-stock/v1/quotations/chk-holiday',
      'CTCA0903R',
      params,
      trContHeader ? { tr_cont: trContHeader } : {}
    );
    var json = response.json;
    var output = Array.isArray(json.output)
      ? json.output
      : (json.output ? [json.output] : []);

    records = records.concat(output);

    var headerMap = lowerCaseKeys_(response.headers || {});
    var nextFlag = String(headerMap.tr_cont || '').toUpperCase();
    var nextFk = String(json.ctx_area_fk || '');
    var nextNk = String(json.ctx_area_nk || '');
    if ((nextFlag !== 'M' && nextFlag !== 'F') || (!nextFk && !nextNk)) {
      break;
    }

    params.CTX_AREA_FK = nextFk;
    params.CTX_AREA_NK = nextNk;
    trContHeader = 'N';
    Utilities.sleep(120);
  }

  return records;
}

function callKisGet_(path, trId, params) {
  return callKisGetWithHeaders_(path, trId, params, {}).json;
}

function callKisGetWithHeaders_(path, trId, params, extraHeaders) {
  var token = getAccessToken_();
  var headers = {
    authorization: 'Bearer ' + token,
    appkey: getSetting_('KIS_APP_KEY', ''),
    appsecret: getSetting_('KIS_APP_SECRET', ''),
    tr_id: trId,
    custtype: 'P',
    charset: 'UTF-8'
  };

  assignOwnProperties_(headers, extraHeaders || {});
  var url = buildUrl_(getSetting_('KIS_BASE_URL', STOCK_EQ_GATEWAY.defaultBaseUrl) + path, params);
  var response = null;
  var statusCode = 0;
  var text = '';
  var json = null;

  for (var attempt = 0; attempt <= STOCK_EQ_GATEWAY.kisRetryDelaysMs.length; attempt += 1) {
    waitForKisRequestSlot_();
    response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true,
      followRedirects: true
    });

    statusCode = response.getResponseCode();
    text = response.getContentText();
    json = safeJsonParse_(text);

    var hasError = statusCode >= 400 || (json && json.rt_cd && String(json.rt_cd) !== '0');
    if (!hasError) {
      break;
    }

    if (!isKisRateLimitResponse_(statusCode, json, text) || attempt >= STOCK_EQ_GATEWAY.kisRetryDelaysMs.length) {
      if (statusCode >= 400) {
        throw createHttpError_(statusCode, extractKisErrorMessage_(json, text));
      }
      throw createHttpError_(502, extractKisErrorMessage_(json, text));
    }

    Utilities.sleep(Number(STOCK_EQ_GATEWAY.kisRetryDelaysMs[attempt] || 900));
  }

  if (statusCode >= 400) {
    throw createHttpError_(statusCode, extractKisErrorMessage_(json, text));
  }
  if (json && json.rt_cd && String(json.rt_cd) !== '0') {
    throw createHttpError_(502, extractKisErrorMessage_(json, text));
  }

  return {
    json: json || {},
    headers: response.getHeaders(),
    statusCode: statusCode,
    text: text
  };
}

function waitForKisRequestSlot_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var key = cacheKey_('kis_last_request_ms');
    var lastTs = Number(props.getProperty(key) || 0);
    var now = Date.now();
    var waitMs = Math.max(0, Number(STOCK_EQ_GATEWAY.kisMinIntervalMs || 0) - (now - lastTs));
    if (waitMs > 0) {
      Utilities.sleep(waitMs);
    }
    props.setProperty(key, String(Date.now()));
  } finally {
    lock.releaseLock();
  }
}

function isKisRateLimitResponse_(statusCode, json, text) {
  var message = String(extractKisErrorMessage_(json, text) || '').toLowerCase();
  if (message.indexOf('초당 거래건수') >= 0) return true;
  if (message.indexOf('rate limit') >= 0) return true;
  if (message.indexOf('too many') >= 0) return true;
  if (message.indexOf('egw00123') >= 0) return true;
  return statusCode === 429;
}

function getAccessToken_() {
  var props = PropertiesService.getScriptProperties();
  var cachedText = props.getProperty(cacheKey_('token'));
  if (cachedText) {
    var cached = safeJsonParse_(cachedText);
    if (cached && cached.accessToken && Number(cached.expiresAt || 0) > Date.now() + STOCK_EQ_GATEWAY.tokenSkewMs) {
      return cached.accessToken;
    }
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    cachedText = props.getProperty(cacheKey_('token'));
    if (cachedText) {
      var freshCached = safeJsonParse_(cachedText);
      if (freshCached && freshCached.accessToken && Number(freshCached.expiresAt || 0) > Date.now() + STOCK_EQ_GATEWAY.tokenSkewMs) {
        return freshCached.accessToken;
      }
    }

    var appKey = getSetting_('KIS_APP_KEY', '');
    var appSecret = getSetting_('KIS_APP_SECRET', '');
    if (!appKey || !appSecret) {
      throw createHttpError_(500, 'Script Properties 에 KIS_APP_KEY 와 KIS_APP_SECRET 을 설정해 주세요.');
    }

    var response = UrlFetchApp.fetch(
      getSetting_('KIS_BASE_URL', STOCK_EQ_GATEWAY.defaultBaseUrl) + '/oauth2/tokenP',
      {
        method: 'post',
        contentType: 'application/json; charset=UTF-8',
        payload: JSON.stringify({
          grant_type: 'client_credentials',
          appkey: appKey,
          appsecret: appSecret
        }),
        headers: {
          Accept: 'application/json'
        },
        muteHttpExceptions: true,
        followRedirects: true
      }
    );

    var statusCode = response.getResponseCode();
    var text = response.getContentText();
    var json = safeJsonParse_(text);
    if (statusCode >= 400 || !json || !json.access_token) {
      throw createHttpError_(statusCode || 500, extractKisErrorMessage_(json, text) || 'KIS access token 발급에 실패했습니다.');
    }

    var expiresInSeconds = Number(json.expires_in || 0);
    var expiresAt = Date.now() + ((expiresInSeconds > 0 ? expiresInSeconds : 3600) * 1000);
    props.setProperty(cacheKey_('token'), JSON.stringify({
      accessToken: json.access_token,
      expiresAt: expiresAt
    }));

    return json.access_token;
  } finally {
    lock.releaseLock();
  }
}

function resolvePreviousClose_(quote, price) {
  var currentPrice = isFiniteNumber_(price) ? price : toNumber_(quote.stck_prpr);
  var rate = toNumber_(quote.prdy_ctrt);
  if (isFiniteNumber_(currentPrice) && isFiniteNumber_(rate) && rate > -100) {
    return roundNumber_(currentPrice / (1 + (rate / 100)), 8);
  }

  var diff = toNumber_(quote.prdy_vrss);
  var sign = String(quote.prdy_vrss_sign || '').trim();
  if (isFiniteNumber_(currentPrice) && isFiniteNumber_(diff)) {
    if (sign === '2' || sign === '1') return currentPrice - diff;
    if (sign === '5' || sign === '4') return currentPrice + diff;
    if (sign === '3') return currentPrice;
  }

  var standardPrice = toNumber_(quote.stck_sdpr);
  if (isFiniteNumber_(standardPrice)) {
    return standardPrice;
  }

  return null;
}

function resolveIndexPreviousClose_(quote) {
  var currentPrice = toNumber_(quote.bstp_nmix_prpr);
  var rate = toNumber_(quote.bstp_nmix_prdy_ctrt);
  if (isFiniteNumber_(currentPrice) && isFiniteNumber_(rate) && rate > -100) {
    return roundNumber_(currentPrice / (1 + (rate / 100)), 8);
  }

  var diff = toNumber_(quote.bstp_nmix_prdy_vrss);
  var sign = String(quote.prdy_vrss_sign || '').trim();
  if (isFiniteNumber_(currentPrice) && isFiniteNumber_(diff)) {
    if (sign === '2' || sign === '1') return currentPrice - Math.abs(diff);
    if (sign === '5' || sign === '4') return currentPrice + Math.abs(diff);
    if (sign === '3') return currentPrice;
    return currentPrice - diff;
  }

  return null;
}

function resolveGatewaySession_(selectedDate, holidays) {
  var today = todayIsoKst_();
  if (selectedDate !== today) return 'historical';
  if (isWeekendIso_(selectedDate) || arrayContains_(holidays, selectedDate)) return 'holiday';

  var timeText = Utilities.formatDate(new Date(), STOCK_EQ_GATEWAY.timezone, 'HH:mm');
  var parts = timeText.split(':');
  var totalMinutes = (Number(parts[0]) * 60) + Number(parts[1]);
  if (totalMinutes < 9 * 60) return 'preopen';
  if (totalMinutes <= (15 * 60) + 30) return 'open';
  return 'closed';
}

function inferLastTradingDate_(selectedDate, monthStart, rows, holidays) {
  if (rows.length) {
    return rows[rows.length - 1].date;
  }

  var cursor = selectedDate;
  while (cursor >= monthStart) {
    if (!isWeekendIso_(cursor) && !arrayContains_(holidays, cursor)) {
      return cursor;
    }
    cursor = addDaysIso_(cursor, -1);
  }
  return selectedDate;
}

function previousBusinessDateIso_(dateIso, holidays) {
  var cursor = addDaysIso_(dateIso, -1);
  while (isWeekendIso_(cursor) || arrayContains_(holidays, cursor)) {
    cursor = addDaysIso_(cursor, -1);
  }
  return cursor;
}

function getBoundaryHolidayDates_(selectedDate) {
  var monthStart = startOfMonthIso_(selectedDate);
  var prevMonthDate = addDaysIso_(monthStart, -1);
  return uniqueStrings_(getMonthlyHolidayDates_(selectedDate).concat(getMonthlyHolidayDates_(prevMonthDate))).sort();
}

function resolveSeriesEndDate_(selectedDate, holidays) {
  var session = resolveGatewaySession_(selectedDate, holidays);
  if (session === 'preopen' || session === 'open' || session === 'holiday' || isWeekendIso_(selectedDate)) {
    return previousBusinessDateIso_(selectedDate, holidays);
  }
  return selectedDate;
}

function partitionMonthRows_(rows, monthStart) {
  var baseline = null;
  var monthRows = [];
  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    if (row.date < monthStart) {
      baseline = row;
      continue;
    }
    monthRows.push(row);
  }
  return {
    baselineDate: baseline ? baseline.date : null,
    baselineClose: baseline ? baseline.close : null,
    rows: monthRows
  };
}

function limitRecentTradingRowsWithBaseline_(rows, baselineDate, baselineClose, windowSize) {
  var maxRows = Math.max(1, Number(windowSize || 0) || STOCK_EQ_GATEWAY.tradingDayWindow);
  if (!rows || rows.length <= maxRows) {
    return {
      baselineDate: baselineDate || null,
      baselineClose: baselineClose || null,
      rows: rows || []
    };
  }

  var startIndex = rows.length - maxRows;
  var limitedRows = rows.slice(startIndex);
  var previousRow = rows[startIndex - 1] || null;

  return {
    baselineDate: previousRow ? previousRow.date : (baselineDate || null),
    baselineClose: previousRow ? previousRow.close : (baselineClose || null),
    rows: limitedRows
  };
}

function normalizeSearchText_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^krx:/, '')
    .replace(/[\s\-_():./\\]/g, '');
}

function sanitizeStockCode_(value) {
  return String(value || '').toUpperCase().replace(/^KRX:/i, '').replace(/[^A-Z0-9]/g, '');
}

function dedupeByCode_(items) {
  var unique = [];
  var seen = {};
  for (var i = 0; i < items.length; i += 1) {
    if (seen[items[i].code]) continue;
    seen[items[i].code] = true;
    unique.push(items[i]);
  }
  return unique;
}

function uniqueStrings_(items) {
  var unique = [];
  var seen = {};
  for (var i = 0; i < items.length; i += 1) {
    var value = String(items[i] || '');
    if (!value || seen[value]) continue;
    seen[value] = true;
    unique.push(value);
  }
  return unique;
}

function todayIsoKst_() {
  return Utilities.formatDate(new Date(), STOCK_EQ_GATEWAY.timezone, 'yyyy-MM-dd');
}

function coerceIsoDate_(value) {
  var raw = String(value || '').trim();
  if (!raw) return todayIsoKst_();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) return basicToIso_(raw);
  throw createHttpError_(400, 'date 형식은 YYYY-MM-DD 또는 YYYYMMDD 이어야 합니다.');
}

function isoToBasic_(value) {
  return String(value || '').replace(/-/g, '');
}

function basicToIso_(value) {
  var basic = String(value || '').replace(/[^0-9]/g, '');
  if (basic.length !== 8) return '';
  return basic.slice(0, 4) + '-' + basic.slice(4, 6) + '-' + basic.slice(6, 8);
}

function startOfMonthIso_(value) {
  return String(value || '').slice(0, 8) + '01';
}

function addDaysIso_(isoDate, offsetDays) {
  var date = new Date(isoDate + 'T00:00:00+09:00');
  date.setDate(date.getDate() + Number(offsetDays || 0));
  return Utilities.formatDate(date, STOCK_EQ_GATEWAY.timezone, 'yyyy-MM-dd');
}

function isWeekendIso_(isoDate) {
  var date = new Date(isoDate + 'T00:00:00+09:00');
  var dayNumber = Number(Utilities.formatDate(date, STOCK_EQ_GATEWAY.timezone, 'u'));
  return dayNumber === 6 || dayNumber === 7;
}

function formatKstTimestamp_(date) {
  return Utilities.formatDate(date, STOCK_EQ_GATEWAY.timezone, "yyyy-MM-dd'T'HH:mm:ss+09:00");
}

function buildUrl_(baseUrl, params) {
  if (!params) return baseUrl;
  var pairs = [];
  var keys = Object.keys(params);
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    var value = params[key];
    if (value === undefined || value === null || value === '') continue;
    pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }
  return pairs.length ? (baseUrl + '?' + pairs.join('&')) : baseUrl;
}

function getSetting_(key, fallbackValue) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  return value !== null && value !== '' ? value : fallbackValue;
}

function extractKisErrorMessage_(json, fallbackText) {
  if (json && json.msg1) return String(json.msg1);
  if (json && json.message) return String(json.message);
  return String(fallbackText || 'KIS API 호출 중 오류가 발생했습니다.');
}

function createHttpError_(status, message) {
  var error = new Error(message);
  error.status = status || 500;
  return error;
}

function buildErrorResponse_(error) {
  return {
    ok: false,
    error: {
      status: Number(error && error.status) || 500,
      message: String((error && error.message) || error || '알 수 없는 오류가 발생했습니다.')
    }
  };
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeJsonParse_(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function toNumber_(value) {
  if (value === null || value === undefined || value === '') return null;
  var parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function isFiniteNumber_(value) {
  return typeof value === 'number' && isFinite(value);
}

function firstFiniteNumber_(values) {
  for (var i = 0; i < values.length; i += 1) {
    if (isFiniteNumber_(values[i])) return values[i];
  }
  return null;
}

function roundNumber_(value, digits) {
  if (!isFiniteNumber_(value)) return null;
  var factor = Math.pow(10, Number(digits || 0));
  return Math.round(value * factor) / factor;
}

function lowerCaseKeys_(source) {
  var result = {};
  var keys = Object.keys(source || {});
  for (var i = 0; i < keys.length; i += 1) {
    result[String(keys[i]).toLowerCase()] = source[keys[i]];
  }
  return result;
}

function assignOwnProperties_(target, source) {
  var keys = Object.keys(source || {});
  for (var i = 0; i < keys.length; i += 1) {
    target[keys[i]] = source[keys[i]];
  }
  return target;
}

function arrayContains_(items, value) {
  if (!Array.isArray(items)) return false;
  for (var i = 0; i < items.length; i += 1) {
    if (items[i] === value) return true;
  }
  return false;
}

function cacheKey_(suffix) {
  return STOCK_EQ_GATEWAY.propertyPrefix + ':' + suffix;
}

function cacheMetaKey_(suffix) {
  return cacheKey_(suffix) + ':meta';
}

function cacheChunkKey_(suffix, index) {
  return cacheKey_(suffix) + ':chunk:' + index;
}

function loadCachedValue_(suffix) {
  var props = PropertiesService.getScriptProperties();
  var metaText = props.getProperty(cacheMetaKey_(suffix));
  if (!metaText) return null;

  var meta = safeJsonParse_(metaText);
  if (!meta || !Number(meta.chunks)) return null;
  if (meta.expiresAt && Number(meta.expiresAt) < Date.now()) {
    clearCachedValue_(suffix, meta.chunks);
    return null;
  }

  var joined = '';
  for (var i = 0; i < Number(meta.chunks); i += 1) {
    var part = props.getProperty(cacheChunkKey_(suffix, i));
    if (!part) return null;
    joined += part;
  }

  try {
    var bytes = Utilities.base64Decode(joined);
    var unzipped = Utilities.ungzip(Utilities.newBlob(bytes));
    return safeJsonParse_(unzipped.getDataAsString());
  } catch (error) {
    return null;
  }
}

function saveCachedValue_(suffix, value, ttlHours) {
  var props = PropertiesService.getScriptProperties();
  var previousMeta = safeJsonParse_(props.getProperty(cacheMetaKey_(suffix)) || '{}');
  var payload = JSON.stringify(value);
  var compressed = Utilities.gzip(Utilities.newBlob(payload, 'application/json', suffix + '.json'));
  var encoded = Utilities.base64Encode(compressed.getBytes());
  var chunkSize = STOCK_EQ_GATEWAY.cacheChunkSize;
  var chunkCount = Math.max(1, Math.ceil(encoded.length / chunkSize));
  var writes = {};

  for (var i = 0; i < chunkCount; i += 1) {
    writes[cacheChunkKey_(suffix, i)] = encoded.slice(i * chunkSize, (i + 1) * chunkSize);
  }

  writes[cacheMetaKey_(suffix)] = JSON.stringify({
    chunks: chunkCount,
    expiresAt: ttlHours ? (Date.now() + (ttlHours * 60 * 60 * 1000)) : null
  });
  props.setProperties(writes, false);

  var previousChunks = Number(previousMeta && previousMeta.chunks) || 0;
  for (var j = chunkCount; j < previousChunks; j += 1) {
    props.deleteProperty(cacheChunkKey_(suffix, j));
  }
}

function clearCachedValue_(suffix, chunkCount) {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(cacheMetaKey_(suffix));
  for (var i = 0; i < Number(chunkCount || 0); i += 1) {
    props.deleteProperty(cacheChunkKey_(suffix, i));
  }
}
