const MARKET_TIMEZONE = 'Asia/Seoul';
const POLL_INTERVAL_MS = 5000;
const STREAM_CONNECT_TIMEOUT_MS = 10000;
const GATEWAY_REQUEST_SPACING_MS = 420;
const GATEWAY_MIN_INTERVAL_MS = 700;
const GATEWAY_RETRY_DELAYS_MS = [900, 1600, 2400];
const DISPLAY_TRADING_DAY_WINDOW = 5;
const FORCE_SHEET_PIPELINE = true;
const MIN_SLOT_COUNT = 1;
const MAX_SLOT_COUNT = 7;
const DEFAULT_SLOT_COUNT = 1;
const STORAGE_GATEWAY = 'stock_eq_gateway_url';
const STORAGE_LAST_DATE = 'stock_eq_last_date';
const STORAGE_SLOTS = 'stock_eq_slots';
const STORAGE_SLOT_COUNT = 'stock_eq_slot_count';
const DEFAULT_GATEWAY = String(window.STOCK_LAB_CONFIG?.gatewayUrl || '');
const DEFAULT_REALTIME_URL = String(window.STOCK_LAB_CONFIG?.realtimeUrl || '');
const KOSPI_BENCHMARK = { code: '0001', name: 'KOSPI', market: 'INDEX', assetType: 'index', sector: '국내 대표 지수', area: '유가증권시장 전체 흐름' };
const STOCK_CATALOG = [
    { code: '005930', name: '삼성전자', market: 'KOSPI', assetType: 'stock', sector: '반도체·전자', area: '메모리·System LSI·Foundry' },
    { code: '000660', name: 'SK하이닉스', market: 'KOSPI', assetType: 'stock', sector: '메모리 반도체', area: 'DRAM·NAND·HBM' },
    { code: '042700', name: '한미반도체', market: 'KOSPI', assetType: 'stock', sector: '반도체 장비', area: '패키징·TC 본더' },
    { code: '352820', name: '하이브', market: 'KOSPI', assetType: 'stock', sector: '엔터테인먼트', area: '음반·플랫폼·아티스트 IP' },
    { code: '035420', name: 'NAVER', market: 'KOSPI', assetType: 'stock', sector: '인터넷 플랫폼', area: '검색·광고·커머스' },
    { code: '035720', name: '카카오', market: 'KOSPI', assetType: 'stock', sector: '인터넷 플랫폼', area: '메신저·콘텐츠·핀테크' },
    { code: '005380', name: '현대차', market: 'KOSPI', assetType: 'stock', sector: '자동차', area: '완성차·모빌리티' },
    { code: '373220', name: 'LG에너지솔루션', market: 'KOSPI', assetType: 'stock', sector: '2차전지', area: '배터리 셀·에너지 저장' },
    { code: '207940', name: '삼성바이오로직스', market: 'KOSPI', assetType: 'stock', sector: '바이오', area: 'CDMO' },
    { code: '000270', name: '기아', market: 'KOSPI', assetType: 'stock', sector: '자동차', area: '완성차' },
    { code: '051910', name: 'LG화학', market: 'KOSPI', assetType: 'stock', sector: '화학', area: '석유화학·배터리 소재' },
    { code: '006400', name: '삼성SDI', market: 'KOSPI', assetType: 'stock', sector: '2차전지', area: '전지·전자재료' },
    { code: '068270', name: '셀트리온', market: 'KOSPI', assetType: 'stock', sector: '바이오', area: '바이오의약품' }
];
const DEFAULT_SLOT_CODES = ['005930', '000660', '042700', '035420', '035720', '005380', '373220'];
const DEMO_FIXED_ROWS = {
    '005930': { '2026-04-01': 189650, '2026-04-02': 178400, '2026-04-03': 186200, '2026-04-06': 193100, '2026-04-07': 196500, '2026-04-08': 210500 },
    '000660': { '2026-04-01': 897000, '2026-04-02': 830000, '2026-04-03': 876000, '2026-04-06': 886000, '2026-04-07': 916000, '2026-04-08': 1033000 },
    '042700': { '2026-04-01': 138000, '2026-04-02': 128500, '2026-04-03': 132000, '2026-04-06': 139500, '2026-04-07': 145000, '2026-04-08': 151000 },
    '0001': { '2026-04-01': 2480.21, '2026-04-02': 2411.77, '2026-04-03': 2452.44, '2026-04-06': 2479.82, '2026-04-07': 2498.53, '2026-04-08': 2521.12 }
};
const DEMO_FIXED_LIVE = {
    '2026-04-09': { '005930': 204000, '000660': 998000, '042700': 154000, '0001': 2528.73 }
};

const appState = {
    selectedDate: '',
    gatewayUrl: '',
    realtimeUrl: '',
    slotCount: DEFAULT_SLOT_COUNT,
    slots: [],
    catalog: [...STOCK_CATALOG],
    dataMode: 'demo',
    session: 'historical',
    seriesCollection: [],
    pollingHandle: null,
    streamHandle: null,
    isLoading: false
};

function getEl(id) { return document.getElementById(id); }
function getCatalogSource() { return Array.isArray(appState.catalog) && appState.catalog.length ? appState.catalog : STOCK_CATALOG; }
function normalizeText(value) { return String(value || '').replace(/\s+/g, '').toLowerCase(); }
function parseKstDate(dateStr) { return new Date(`${dateStr}T00:00:00+09:00`); }
function startOfMonth(dateStr) { return `${dateStr.slice(0, 8)}01`; }
function formatPercent(value, digits = 2) {
    if (!Number.isFinite(value)) return '-';
    return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;
}
function getValueTone(value) {
    if (!Number.isFinite(value) || value === 0) return 'neutral';
    return value > 0 ? 'up' : 'down';
}
function formatDateLabel(dateStr) {
    return new Intl.DateTimeFormat('ko-KR', {
        timeZone: MARKET_TIMEZONE,
        month: 'short',
        day: 'numeric',
        weekday: 'short'
    }).format(parseKstDate(dateStr));
}
function waitMs(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}
function isGatewayRateLimitErrorMessage(message) {
    const normalized = String(message || '').toLowerCase();
    if (!normalized) return false;
    return normalized.includes('초당 거래건수') || normalized.includes('rate limit') || normalized.includes('too many');
}
function getTodayKstDate() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: MARKET_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}
function getKstClockParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: MARKET_TIMEZONE,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return {
        date: `${values.year}-${values.month}-${values.day}`,
        weekday: values.weekday,
        hour: Number(values.hour),
        minute: Number(values.minute),
        second: Number(values.second),
        timeLabel: `${values.hour}:${values.minute}:${values.second}`
    };
}
function addDays(dateStr, days) {
    const date = parseKstDate(dateStr);
    date.setUTCDate(date.getUTCDate() + days);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: MARKET_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}
function isWeekend(dateStr) {
    const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: MARKET_TIMEZONE,
        weekday: 'short'
    }).format(parseKstDate(dateStr));
    return weekday === 'Sat' || weekday === 'Sun';
}
function previousBusinessDate(dateStr, holidaySet = new Set()) {
    let cursor = addDays(dateStr, -1);
    while (isWeekend(cursor) || holidaySet.has(cursor)) {
        cursor = addDays(cursor, -1);
    }
    return cursor;
}
function resolveMarketSession(selectedDate, holidaySet = new Set()) {
    const now = getKstClockParts();
    if (selectedDate !== now.date) return 'historical';
    if (isWeekend(selectedDate) || holidaySet.has(selectedDate)) return 'holiday';
    const totalMinutes = now.hour * 60 + now.minute;
    if (totalMinutes < 9 * 60) return 'preopen';
    if (totalMinutes <= (15 * 60) + 30) return 'open';
    return 'closed';
}
function getSessionLabel(session) {
    if (session === 'preopen') return '장 시작 전';
    if (session === 'open') return '장중 5초 갱신';
    if (session === 'closed') return '당일 종가';
    if (session === 'holiday') return '휴장일';
    return '기준일 조회';
}
function getSessionBadgeClass(session) {
    if (session === 'open') return 'status-open';
    if (session === 'preopen') return 'status-preopen';
    if (session === 'closed') return 'status-closed';
    return 'status-historical';
}
function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function createDefaultSlots() {
    return Array.from({ length: appState.slotCount }, (_, index) => {
        const defaultCode = DEFAULT_SLOT_CODES[index] || '';
        const defaultStock = STOCK_CATALOG.find((item) => item.code === defaultCode) || null;
        return {
            id: index + 1,
            query: defaultStock ? defaultStock.name : '',
            stock: defaultStock
        };
    });
}
function normalizeSlotCount(rawCount) {
    const parsed = Number(rawCount);
    if (!Number.isFinite(parsed)) return DEFAULT_SLOT_COUNT;
    return Math.max(MIN_SLOT_COUNT, Math.min(MAX_SLOT_COUNT, Math.trunc(parsed)));
}
function buildSlotsForCount(nextCount, previousSlots = []) {
    return Array.from({ length: nextCount }, (_, index) => {
        const existing = previousSlots[index];
        if (existing) {
            return {
                id: index + 1,
                query: String(existing.query || ''),
                stock: existing.stock ? enrichStockMeta(existing.stock) : null
            };
        }
        const defaultCode = DEFAULT_SLOT_CODES[index] || '';
        const defaultStock = STOCK_CATALOG.find((item) => item.code === defaultCode) || null;
        return {
            id: index + 1,
            query: defaultStock ? defaultStock.name : '',
            stock: defaultStock
        };
    });
}
function enrichStockMeta(stock) {
    if (!stock) return null;
    const localMatch = getCatalogSource().find((item) => item.code === String(stock.code || '').trim());
    return {
        code: String(stock.code || '').trim(),
        name: String(stock.name || '').trim(),
        market: String(stock.market || localMatch?.market || '').trim(),
        assetType: String(stock.assetType || localMatch?.assetType || 'stock').trim(),
        sector: String(stock.sector || localMatch?.sector || '').trim(),
        area: String(stock.area || localMatch?.area || '').trim()
    };
}
function buildCatalogDatalist() {
    getEl('stock-catalog-list').innerHTML = getCatalogSource().map((item) => (
        `<option value="${item.name}">${item.code} ${item.name}</option><option value="${item.code}">${item.name}</option>`
    )).join('');
}
function getSlotMetaText(slot) {
    if (!slot.stock) return '';
    const summary = getMonthlyEqualRateSummary(slot.stock.code);
    if (!summary) return `최근 ${DISPLAY_TRADING_DAY_WINDOW}영업일 등가률 합계 -`;
    return `최근 ${DISPLAY_TRADING_DAY_WINDOW}영업일 등가률 합계 (${summary.rangeLabel}) ${formatPercent(summary.totalEqualRate)}`;
}
function getKospiMetaText() {
    const summary = getMonthlyEqualRateSummary(KOSPI_BENCHMARK.code);
    if (!summary) return `최근 ${DISPLAY_TRADING_DAY_WINDOW}영업일 등가률 합계 -`;
    return `최근 ${DISPLAY_TRADING_DAY_WINDOW}영업일 등가률 합계 (${summary.rangeLabel}) ${formatPercent(summary.totalEqualRate)}`;
}
function formatMonthDay(dateStr) {
    const [, month, day] = String(dateStr || '').split('-');
    if (!month || !day) return dateStr;
    return `${Number(month)}/${Number(day)}`;
}
function getMonthlyEqualRateSummary(stockCode) {
    const seriesItem = appState.seriesCollection.find((item) => item?.target?.code === stockCode);
    const rows = Array.isArray(seriesItem?.rows) ? seriesItem.rows : [];
    if (!rows.length) return null;
    const windowRows = rows
        .filter((row) => Number.isFinite(Number(row?.equalRate)))
        .sort((left, right) => left.date.localeCompare(right.date));
    if (!windowRows.length) return null;
    const limitedRows = windowRows.slice(-1 * DISPLAY_TRADING_DAY_WINDOW);
    const totalFactor = limitedRows.reduce((acc, row) => acc * (1 + Number(row.equalRate)), 1);
    const totalEqualRate = totalFactor - 1;
    return {
        totalEqualRate,
        startDate: limitedRows[0].date,
        endDate: limitedRows[limitedRows.length - 1].date,
        rangeLabel: `${formatMonthDay(limitedRows[0].date)}~${formatMonthDay(limitedRows[limitedRows.length - 1].date)}`
    };
}

function getDemoStartingValue(target, dateStr) {
    const codeSeed = Number(String(target.code || '').slice(-3)) || 120;
    const monthSeed = Number(dateStr.slice(5, 7)) || 1;
    if (target.assetType === 'index') return 2380 + (monthSeed * 8) + (codeSeed * 0.04);
    return 40000 + (codeSeed * 170) + (monthSeed * 800);
}
function normalizeDemoValue(value, target) {
    if (target.assetType === 'index') return Number(Math.max(100, value).toFixed(2));
    return Math.round(Math.max(1000, value) / 50) * 50;
}
function getFixedDemoClose(target, dateStr) {
    return DEMO_FIXED_ROWS[target.code]?.[dateStr] ?? null;
}
function deriveDemoBaselineClose(target, firstVisibleClose) {
    const seed = Number(String(target.code || '').slice(-2)) || 1;
    const dailyMove = Math.max(-0.03, Math.min(0.03, Math.sin(seed * 0.37) * 0.018));
    return normalizeDemoValue(firstVisibleClose / (1 + dailyMove), target);
}
function buildGenericTimeline(target, startDate, endDate, holidaySet = new Set()) {
    const rows = [];
    let cursor = startDate;
    let value = getDemoStartingValue(target, endDate);
    let idx = 0;
    while (cursor <= endDate) {
        if (!isWeekend(cursor) && !holidaySet.has(cursor)) {
            const fixedValue = getFixedDemoClose(target, cursor);
            if (fixedValue !== null) {
                value = fixedValue;
            } else {
                const waveSeed = target.assetType === 'index' ? 0.0035 : 0.022;
                const driftSeed = target.assetType === 'index' ? 0.0014 : 0.005;
                const wave = Math.sin((idx + 1) * 0.9 + Number(String(target.code).slice(-2) || 1));
                const drift = Math.cos((idx + 2) * 0.45) * driftSeed;
                value = normalizeDemoValue(value * (1 + (wave * waveSeed) + drift), target);
            }
            rows.push({ date: cursor, close: value });
            idx += 1;
        }
        cursor = addDays(cursor, 1);
    }
    return rows;
}
function buildDemoSeriesPayload(target, selectedDate, holidaySet = new Set()) {
    const session = resolveMarketSession(selectedDate, holidaySet);
    let historyEndDate = selectedDate;
    if (session === 'preopen' || session === 'open' || session === 'holiday' || isWeekend(selectedDate) || holidaySet.has(selectedDate)) {
        historyEndDate = previousBusinessDate(selectedDate, holidaySet);
    }
    const monthStart = startOfMonth(historyEndDate);
    const baselineDate = previousBusinessDate(monthStart, holidaySet);
    const timeline = buildGenericTimeline(target, baselineDate, historyEndDate, holidaySet);
    const baselineRow = timeline.find((row) => row.date === baselineDate) || null;
    const rows = timeline.filter((row) => row.date >= monthStart);
    const firstVisibleClose = rows.length ? Number(rows[0].close) : null;
    let baselineClose = Number.isFinite(Number(baselineRow?.close)) ? Number(baselineRow.close) : null;
    if (Number.isFinite(firstVisibleClose)) {
        const derivedBaselineClose = deriveDemoBaselineClose(target, firstVisibleClose);
        const baselineGap = Number.isFinite(baselineClose) && baselineClose !== 0 ? Math.abs((firstVisibleClose / baselineClose) - 1) : null;
        if (!Number.isFinite(baselineClose) || baselineClose <= 0 || (Number.isFinite(baselineGap) && baselineGap > 0.35)) {
            baselineClose = derivedBaselineClose;
        }
    }
    return {
        stock: target,
        selectedDate,
        lastTradingDate: rows.length ? rows[rows.length - 1].date : historyEndDate,
        baselineDate: baselineRow?.date || null,
        baselineClose,
        rows,
        holidays: Array.from(holidaySet),
        source: 'demo'
    };
}
function computeRowsWithEqualRate(rows, baselineClose = null) {
    const sorted = [...rows].sort((left, right) => left.date.localeCompare(right.date));
    return sorted.map((row, index) => {
        const close = Number(row.close);
        const prevClose = index > 0 ? Number(sorted[index - 1].close) : Number(baselineClose);
        return {
            date: row.date,
            close,
            prevClose: Number.isFinite(prevClose) ? prevClose : null,
            equalRate: Number.isFinite(close) && Number.isFinite(prevClose) && prevClose !== 0 ? (close / prevClose) - 1 : null
        };
    });
}
function buildComposedRows(series, liveSnapshot, session) {
    const historyRows = computeRowsWithEqualRate(series.rows, series.baselineClose).map((row) => ({
        ...row,
        kind: 'history',
        badge: '확정',
        badgeClass: session === 'historical' ? 'historical' : 'final'
    }));
    if (session === 'preopen') {
        return [{
            date: series.selectedDate,
            close: null,
            prevClose: liveSnapshot?.prevClose ?? historyRows.at(-1)?.close ?? series.baselineClose ?? null,
            equalRate: null,
            kind: 'live',
            badge: '대기',
            badgeClass: 'pending'
        }, ...historyRows].sort((left, right) => right.date.localeCompare(left.date));
    }
    if (session === 'open' && (!liveSnapshot || !Number.isFinite(liveSnapshot.price))) {
        return [{
            date: series.selectedDate,
            close: null,
            prevClose: historyRows.at(-1)?.close ?? series.baselineClose ?? null,
            equalRate: null,
            kind: 'live',
            badge: 'LIVE',
            badgeClass: 'pending'
        }, ...historyRows].sort((left, right) => right.date.localeCompare(left.date));
    }
    if ((session === 'open' || session === 'closed') && liveSnapshot && Number.isFinite(liveSnapshot.price)) {
        const liveDate = liveSnapshot.date || series.selectedDate;
        const historyWithoutLiveDate = historyRows.filter((row) => row.date !== liveDate);
        return [{
            date: liveDate,
            close: liveSnapshot.price,
            prevClose: Number.isFinite(liveSnapshot.prevClose) ? liveSnapshot.prevClose : (historyRows.at(-1)?.close ?? series.baselineClose ?? null),
            equalRate: Number.isFinite(liveSnapshot.equalRate)
                ? liveSnapshot.equalRate
                : (Number.isFinite(liveSnapshot.prevClose) && liveSnapshot.prevClose !== 0 ? (liveSnapshot.price / liveSnapshot.prevClose) - 1 : null),
            kind: 'live',
            badge: session === 'open' ? 'LIVE' : '종가',
            badgeClass: session === 'open' ? 'live' : 'final'
        }, ...historyWithoutLiveDate].sort((left, right) => right.date.localeCompare(left.date));
    }
    return historyRows.sort((left, right) => right.date.localeCompare(left.date));
}
async function mapSequential(items, mapper, spacingMs = 0) {
    const results = [];
    for (let index = 0; index < items.length; index += 1) {
        results.push(await mapper(items[index], index));
        if (spacingMs > 0 && index < items.length - 1) {
            await waitMs(spacingMs);
        }
    }
    return results;
}
function shouldUseRealtimeStream() {
    if (FORCE_SHEET_PIPELINE) return false;
    return Boolean(appState.realtimeUrl.trim()) && appState.selectedDate === getTodayKstDate();
}
function createRealtimeStreamClient(baseUrl) {
    const normalizedBaseUrl = String(baseUrl || '').trim();
    if (!normalizedBaseUrl || typeof EventSource === 'undefined') return null;
    return {
        subscribe(targets, selectedDate, handlers = {}) {
            const url = new URL(normalizedBaseUrl);
            const codes = targets
                .map((target) => String(target?.code || '').trim())
                .filter(Boolean)
                .filter((code, index, source) => source.indexOf(code) === index);
            url.searchParams.set('codes', codes.join(','));
            url.searchParams.set('date', selectedDate);
            const source = new EventSource(url.toString());
            let isClosed = false;
            let isReady = false;
            const timeoutHandle = window.setTimeout(() => {
                if (isReady || isClosed) return;
                try {
                    source.close();
                } catch (error) {
                    console.warn('stream timeout close failed', error);
                }
                handlers.onError?.(new Error('실시간 스트림 연결 시간이 초과되었습니다.'));
            }, STREAM_CONNECT_TIMEOUT_MS);
            source.onopen = () => {
                if (isClosed) return;
                isReady = true;
                window.clearTimeout(timeoutHandle);
                handlers.onOpen?.();
            };
            source.onmessage = (event) => {
                if (isClosed) return;
                try {
                    const payload = JSON.parse(event.data);
                    if (payload?.type === 'snapshot') {
                        handlers.onSnapshot?.(payload);
                        return;
                    }
                    if (payload?.type === 'session') {
                        handlers.onSession?.(payload);
                        return;
                    }
                    if (payload?.type === 'error') {
                        handlers.onError?.(new Error(payload.message || '실시간 스트림 오류가 발생했습니다.'));
                    }
                } catch (error) {
                    console.error('stream parse failed', error);
                }
            };
            source.onerror = () => {
                if (isClosed) return;
                window.clearTimeout(timeoutHandle);
                try {
                    source.close();
                } catch (error) {
                    console.warn('stream close failed', error);
                }
                handlers.onError?.(new Error('실시간 스트림 연결이 종료되었습니다.'));
            };
            return {
                close() {
                    if (isClosed) return;
                    isClosed = true;
                    window.clearTimeout(timeoutHandle);
                    try {
                        source.close();
                    } catch (error) {
                        console.warn('stream close failed', error);
                    }
                }
            };
        }
    };
}
function createMockAdapter() {
    return {
        async searchStocks(query) {
            const normalized = normalizeText(query);
            if (!normalized) return [];
            return STOCK_CATALOG.filter((item) => normalizeText(item.code).includes(normalized) || normalizeText(item.name).includes(normalized)).slice(0, 8);
        },
        async loadSeries(target, selectedDate) {
            return buildDemoSeriesPayload(target, selectedDate, new Set());
        },
        async loadIntraday(target, selectedDate) {
            const today = getTodayKstDate();
            if (selectedDate !== today) return null;
            const historical = buildDemoSeriesPayload(target, selectedDate, new Set());
            const prevClose = Number(historical.rows.at(-1)?.close || 0);
            if (!prevClose) return null;
            const clock = getKstClockParts();
            const session = resolveMarketSession(selectedDate, new Set(historical.holidays || []));
            if (session === 'preopen') {
                return {
                    date: selectedDate,
                    prevClose,
                    price: null,
                    equalRate: null,
                    asOf: `${selectedDate}T${clock.timeLabel}+09:00`,
                    session
                };
            }
            const fixedValue = DEMO_FIXED_LIVE[selectedDate]?.[target.code];
            const variation = target.assetType === 'index'
                ? Math.sin((clock.hour * 60 + clock.minute) / 25) * 0.004
                : Math.sin((clock.hour * 60 + clock.minute) / 38) * 0.015;
            const liveValue = Number.isFinite(Number(fixedValue)) ? Number(fixedValue) : normalizeDemoValue(prevClose * (1 + variation), target);
            return {
                date: selectedDate,
                prevClose,
                price: liveValue,
                equalRate: prevClose !== 0 ? (liveValue / prevClose) - 1 : null,
                asOf: `${selectedDate}T${clock.timeLabel}+09:00`,
                session
            };
        }
    };
}
function createGatewayAdapter(baseUrl) {
    if (!baseUrl) return null;
    let lastRequestAt = 0;
    async function waitForGatewayTurn() {
        const elapsed = Date.now() - lastRequestAt;
        const waitNeeded = Math.max(0, GATEWAY_MIN_INTERVAL_MS - elapsed);
        if (waitNeeded > 0) {
            await waitMs(waitNeeded);
        }
        lastRequestAt = Date.now();
    }
    async function request(action, params = {}) {
        const url = new URL(baseUrl);
        url.searchParams.set('action', action);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, value);
            }
        });
        let attempt = 0;
        while (true) {
            try {
                await waitForGatewayTurn();
                const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
                const rawText = await response.text();
                let payload = null;
                try {
                    payload = rawText ? JSON.parse(rawText) : null;
                } catch (_) {
                    payload = null;
                }
                if (!response.ok) {
                    throw new Error(payload?.error?.message || payload?.message || `Gateway HTTP ${response.status}`);
                }
                if (payload && payload.ok === false) {
                    throw new Error(payload?.error?.message || payload?.message || 'Gateway error');
                }
                return payload;
            } catch (error) {
                if (!isGatewayRateLimitErrorMessage(error?.message) || attempt >= GATEWAY_RETRY_DELAYS_MS.length) {
                    throw error;
                }
                const retryDelay = GATEWAY_RETRY_DELAYS_MS[attempt];
                attempt += 1;
                await waitMs(retryDelay);
            }
        }
    }
    return {
        async loadCatalog(market = 'KOSPI') {
            const payload = await request('stock-catalog', { market });
            return Array.isArray(payload?.items) ? payload.items.map(enrichStockMeta) : [];
        },
        async searchStocks(query) {
            const payload = await request('stock-search', { q: query });
            return Array.isArray(payload?.items) ? payload.items.map(enrichStockMeta) : [];
        },
        async loadSeries(target, selectedDate, slotId = null) {
            const action = target.assetType === 'index' ? 'index-month' : 'equity-month';
            const payload = await request(
                action,
                target.assetType === 'index'
                    ? { indexCode: target.code, date: selectedDate }
                    : { ticker: target.code, date: selectedDate, slot: slotId }
            );
            return {
                stock: enrichStockMeta(payload?.stock || target),
                selectedDate: payload?.selectedDate || selectedDate,
                lastTradingDate: payload?.lastTradingDate || selectedDate,
                baselineDate: payload?.baselineDate || null,
                baselineClose: Number.isFinite(Number(payload?.baselineClose)) ? Number(payload.baselineClose) : null,
                rows: Array.isArray(payload?.rows) ? payload.rows : [],
                holidays: Array.isArray(payload?.holidays) ? payload.holidays : [],
                source: payload?.source || 'gateway'
            };
        },
        async loadIntraday(target, selectedDate) {
            const action = target.assetType === 'index' ? 'index-snapshot' : 'intraday-snapshot';
            const payload = await request(
                action,
                target.assetType === 'index'
                    ? { indexCode: target.code, date: selectedDate }
                    : { ticker: target.code, date: selectedDate }
            );
            if (!payload) return null;
            return {
                date: payload.date || selectedDate,
                prevClose: Number.isFinite(Number(payload.prevClose)) ? Number(payload.prevClose) : null,
                price: Number.isFinite(Number(payload.price)) ? Number(payload.price) : null,
                equalRate: Number.isFinite(Number(payload.equalRate)) ? Number(payload.equalRate) : null,
                asOf: payload.asOf || '',
                session: payload.session || 'open'
            };
        },
        async syncSheetTargets(targets = [], selectedDate = '', names = []) {
            const tickers = (targets || []).map((item) => String(item || '').trim()).filter(Boolean);
            const payload = {
                tickers: tickers.join(','),
                date: selectedDate,
                names: (names || []).map((item) => String(item || '').trim()).filter(Boolean).join('|')
            };
            return request('sheet-sync-targets', payload);
        }
    };
}
function getActiveAdapter() {
    const gatewayUrl = appState.gatewayUrl.trim();
    if (!gatewayUrl) {
        appState.dataMode = 'demo';
        return createMockAdapter();
    }
    appState.dataMode = 'gateway';
    return createGatewayAdapter(gatewayUrl);
}
function getRealtimeClient() {
    if (FORCE_SHEET_PIPELINE) return null;
    const realtimeUrl = appState.realtimeUrl.trim();
    if (!realtimeUrl) return null;
    return createRealtimeStreamClient(realtimeUrl);
}
function findLocalStock(query) {
    const normalized = normalizeText(query);
    if (!normalized) return null;
    return getCatalogSource().find((item) => normalizeText(item.code) === normalized || normalizeText(item.name) === normalized) || null;
}
function searchLocalStocks(query) {
    const normalized = normalizeText(query);
    if (!normalized) return [];
    const exact = [];
    const prefix = [];
    const contains = [];
    for (const item of getCatalogSource()) {
        const codeKey = normalizeText(item.code);
        const nameKey = normalizeText(item.name);
        if (codeKey === normalized || nameKey === normalized) {
            exact.push(item);
            continue;
        }
        if (codeKey.startsWith(normalized) || nameKey.startsWith(normalized)) {
            prefix.push(item);
            continue;
        }
        if (codeKey.includes(normalized) || nameKey.includes(normalized)) {
            contains.push(item);
        }
    }
    return [...exact, ...prefix, ...contains];
}
async function searchStocksWithFallback(_adapter, query) {
    const normalized = String(query || '').trim();
    if (!normalized) return [];
    const seen = new Set();
    const collected = [];
    function pushItems(items) {
        for (const item of items || []) {
            const enriched = enrichStockMeta(item);
            const code = String(enriched?.code || '').trim();
            if (!code || seen.has(code)) continue;
            seen.add(code);
            collected.push(enriched);
        }
    }
    pushItems(searchLocalStocks(normalized));
    if (collected.length) return collected;
    const compact = normalizeText(normalized);
    for (let end = compact.length - 1; end >= 2; end -= 1) {
        const candidate = compact.slice(0, end);
        pushItems(searchLocalStocks(candidate));
        if (collected.length) break;
    }
    return collected;
}
async function resolveStock(query) {
    const normalized = String(query || '').trim();
    if (!normalized) return null;
    const localMatch = findLocalStock(normalized);
    if (localMatch) return localMatch;
    const adapter = getActiveAdapter();
    const matchedItems = await searchStocksWithFallback(adapter, normalized);
    return matchedItems[0] || null;
}
function mergeCatalogItems(baseItems, nextItems) {
    const seen = new Set();
    const merged = [];
    for (const item of [...(baseItems || []), ...(nextItems || [])]) {
        const enriched = enrichStockMeta(item);
        const code = String(enriched?.code || '').trim();
        if (!code || seen.has(code)) continue;
        seen.add(code);
        merged.push(enriched);
    }
    return merged;
}
async function ensureCatalogLoaded() {
    appState.catalog = mergeCatalogItems(STOCK_CATALOG, []);
    buildCatalogDatalist();
}

function persistSlots() {
    localStorage.setItem(STORAGE_SLOTS, JSON.stringify(appState.slots.map((slot) => ({
        id: slot.id,
        query: slot.query,
        stock: slot.stock
    }))));
}
function persistSlotCount() {
    localStorage.setItem(STORAGE_SLOT_COUNT, String(appState.slotCount));
}
function syncSlotCountInput() {
    const slotCountEl = getEl('slot-count');
    if (!slotCountEl) return;
    slotCountEl.value = String(appState.slotCount);
}
function updateEmptyStateCopy() {
    const emptyEl = getEl('empty-state');
    if (!emptyEl) return;
    emptyEl.textContent = `기준일과 종목을 불러오면 여기에 날짜 / KOSPI / 주식1~주식${appState.slotCount} 등가률 표가 표시됩니다.`;
}
function readSlotInputsIntoState() {
    appState.slots = appState.slots.map((slot) => {
        const input = getEl(`stock-slot-${slot.id}`);
        const query = String(input?.value || '').trim();
        const stillSame = slot.stock && (normalizeText(query) === normalizeText(slot.stock.name) || normalizeText(query) === normalizeText(slot.stock.code));
        return {
            ...slot,
            query,
            stock: stillSame ? slot.stock : null
        };
    });
}
async function resolveSlots() {
    readSlotInputsIntoState();
    appState.slots = await Promise.all(appState.slots.map(async (slot) => {
        if (!slot.query) return { ...slot, stock: null };
        if (slot.stock) return { ...slot, query: slot.stock.name, stock: enrichStockMeta(slot.stock) };
        const resolved = await resolveStock(slot.query);
        return resolved
            ? { ...slot, query: resolved.name, stock: enrichStockMeta(resolved) }
            : { ...slot, stock: null };
    }));
    persistSlots();
    renderTableHead();
}
function clearPolling() {
    if (appState.pollingHandle) {
        window.clearInterval(appState.pollingHandle);
        appState.pollingHandle = null;
    }
    if (appState.streamHandle) {
        appState.streamHandle.close();
        appState.streamHandle = null;
    }
}
function renderLiveState() {
    renderStatusStrips();
    renderSelectionNote(appState.seriesCollection);
    renderTable(buildMatrixRows(appState.seriesCollection, appState.session));
}
function applyRealtimeSnapshotUpdate(snapshotPayload) {
    const code = String(snapshotPayload?.code || '').trim();
    if (!code) return false;
    let didUpdate = false;
    appState.seriesCollection = appState.seriesCollection.map((item) => {
        if (String(item?.target?.code || '').trim() !== code) {
            return item;
        }
        didUpdate = true;
        const nextSnapshot = {
            ...(item.liveSnapshot || {}),
            date: snapshotPayload.date || appState.selectedDate,
            prevClose: Number.isFinite(Number(snapshotPayload.prevClose)) ? Number(snapshotPayload.prevClose) : (item.liveSnapshot?.prevClose ?? null),
            price: Number.isFinite(Number(snapshotPayload.price)) ? Number(snapshotPayload.price) : (item.liveSnapshot?.price ?? null),
            equalRate: Number.isFinite(Number(snapshotPayload.equalRate))
                ? Number(snapshotPayload.equalRate)
                : (Number.isFinite(Number(snapshotPayload.price)) && Number.isFinite(Number(snapshotPayload.prevClose)) && Number(snapshotPayload.prevClose) !== 0
                    ? (Number(snapshotPayload.price) / Number(snapshotPayload.prevClose)) - 1
                    : (item.liveSnapshot?.equalRate ?? null)),
            asOf: snapshotPayload.asOf || item.liveSnapshot?.asOf || '',
            session: snapshotPayload.session || item.liveSnapshot?.session || appState.session
        };
        return {
            ...item,
            liveSnapshot: nextSnapshot,
            rows: item.series ? buildComposedRows(item.series, nextSnapshot, appState.session) : []
        };
    });
    return didUpdate;
}
function setSessionAndRebuildRows(nextSession) {
    if (nextSession) {
        appState.session = nextSession;
    }
    appState.seriesCollection = appState.seriesCollection.map((item) => ({
        ...item,
        rows: item.series ? buildComposedRows(item.series, item.liveSnapshot, appState.session) : []
    }));
}
async function runRestPollingCycle() {
    const pollAdapter = getActiveAdapter();
    const polledState = await refreshLiveSnapshots(pollAdapter, appState.seriesCollection);
    appState.seriesCollection = polledState.seriesCollection;
    appState.session = polledState.session;
    renderLiveState();
    if (appState.session !== 'open') {
        clearPolling();
    }
}
function startRestPolling({ immediate = false } = {}) {
    if (appState.session !== 'open') return;
    const runCycleSafely = async () => {
        try {
            await runRestPollingCycle();
        } catch (error) {
            console.error('polling failed', error);
            clearPolling();
        }
    };
    if (immediate) {
        void runCycleSafely();
    }
    appState.pollingHandle = window.setInterval(async () => {
        await runCycleSafely();
    }, POLL_INTERVAL_MS);
}
function startRealtimeStreamOrPolling() {
    if (appState.session !== 'open') return;
    const realtimeClient = getRealtimeClient();
    const targets = appState.seriesCollection
        .map((item) => item.target)
        .filter(Boolean);
    if (!realtimeClient || !targets.length || appState.selectedDate !== getTodayKstDate()) {
        startRestPolling();
        return;
    }
    let fallbackTriggered = false;
    const triggerFallback = (error) => {
        console.error('realtime stream failed', error);
        if (fallbackTriggered) return;
        fallbackTriggered = true;
        if (appState.streamHandle) {
            appState.streamHandle.close();
            appState.streamHandle = null;
        }
        startRestPolling({ immediate: true });
    };
    appState.streamHandle = realtimeClient.subscribe(targets, appState.selectedDate, {
        onSnapshot(payload) {
            if (payload?.session && payload.session !== appState.session) {
                appState.session = payload.session;
            }
            const didUpdate = applyRealtimeSnapshotUpdate(payload);
            if (!didUpdate) return;
            setSessionAndRebuildRows(appState.session);
            renderLiveState();
            if (appState.session !== 'open') {
                clearPolling();
            }
        },
        onSession(payload) {
            if (!payload?.session || payload.session === appState.session) return;
            setSessionAndRebuildRows(payload.session);
            renderLiveState();
            if (appState.session !== 'open') {
                clearPolling();
            }
        },
        onError(error) {
            triggerFallback(error);
        }
    });
}
function setLoading(isLoading) {
    appState.isLoading = isLoading;
    getEl('apply-btn').textContent = isLoading ? '조회 중...' : '조회';
    getEl('refresh-btn').textContent = isLoading ? '불러오는 중...' : '새로고침';
}
function renderStatusStrips() {
    const runtime = getEl('runtime-status-strip');
    if (!runtime) return;
    const selectedNames = appState.slots.filter((slot) => slot.stock).map((slot) => slot.stock.name);
    runtime.innerHTML = [
        `<span class="status-badge ${getSessionBadgeClass(appState.session)}"><span class="status-dot"></span>${getSessionLabel(appState.session)}</span>`,
        `<span class="status-badge"><span class="status-dot"></span>${appState.dataMode === 'gateway' ? '실데이터 연결' : '데모 데이터'}</span>`,
        `<span class="status-badge"><span class="status-dot"></span>KOSPI는 항상 포함</span>`,
        `<span class="status-badge"><span class="status-dot"></span>${selectedNames.length ? `${selectedNames.length}개 종목 선택` : '선택 종목 없음'}</span>`
    ].join('');
}
function getActualEndDate(seriesCollection) {
    return seriesCollection.reduce((latest, item) => {
        const current = item?.series?.lastTradingDate || '';
        if (!current) return latest;
        if (!latest) return current;
        return latest.localeCompare(current) < 0 ? current : latest;
    }, '');
}
function renderSelectionNote(seriesCollection) {
    const noteEl = getEl('selection-note');
    if (!noteEl) return;
    const unresolved = appState.slots.filter((slot) => slot.query && !slot.stock).map((slot) => `주식${slot.id}`);
    const actualEnd = getActualEndDate(seriesCollection);
    const dateNote = actualEnd && actualEnd !== appState.selectedDate
        ? `선택일 ${appState.selectedDate}이 거래일이 아니거나 장중이라 실제 월 계산은 ${actualEnd} 기준으로 맞췄습니다.`
        : `기준일 ${appState.selectedDate}이 속한 월의 거래일만 역순으로 보여줍니다.`;
    const realtimeNote = FORCE_SHEET_PIPELINE
        ? '현재는 SHEET 파이프라인 전용 모드입니다. 프론트 내장 종목사전(이름/코드)으로 티커를 매칭해 시트 입력셀로 동기화한 뒤 시트 계산값만 읽어옵니다.'
        : (appState.dataMode === 'gateway'
            ? (appState.session === 'open'
                ? (shouldUseRealtimeStream()
                    ? '장중에는 KIS 웹소켓 relay로 오늘 행을 바로 반영하고, relay가 끊기면 REST fallback으로 전환합니다.'
                    : '장중에는 KIS REST를 5초 간격으로 다시 불러오는 fallback 방식입니다.')
                : '장 시작 전에는 오늘 행이 비고, 장이 열리면 오늘 등가률이 채워집니다.')
            : '현재는 데모 데이터입니다. 실데이터를 쓰려면 config.js에 게이트웨이 URL을 넣어 주세요.');
    const unresolvedNote = unresolved.length
        ? `${unresolved.join(', ')}은 아직 종목 매칭이 되지 않아 빈 열로 남습니다.`
        : '입력한 종목은 이름이나 코드로 자동 연결됩니다.';
    const slotNote = appState.slots.map((slot) => `주식${slot.id} ${slot.stock ? slot.stock.name : '비어 있음'}`).join(' / ');
    noteEl.innerHTML = `<strong>표 규칙</strong> · 각 칸은 최근 ${DISPLAY_TRADING_DAY_WINDOW}영업일의 일별 등가률을 표시합니다. 첫 표시일은 직전 거래일 종가를 기준으로 계산합니다.<br>${dateNote}<br>${realtimeNote}<br>${unresolvedNote}<br>KOSPI / ${slotNote}`;
}
function buildMatrixRows(seriesCollection, session) {
    const usable = seriesCollection.map((item) => ({
        ...item,
        map: new Map((item.rows || []).map((row) => [row.date, row]))
    }));
    const allDates = new Set();
    usable.forEach((item) => {
        (item.rows || []).forEach((row) => allDates.add(row.date));
    });
    return Array.from(allDates).sort((left, right) => right.localeCompare(left)).map((date) => {
        const cells = usable.map((item) => item.map.get(date) || null);
        const liveRow = cells.find((row) => row?.badgeClass === 'live');
        const pendingRow = cells.find((row) => row?.badgeClass === 'pending');
        const finalRow = cells.find((row) => row?.badgeClass === 'final');
        const statusRow = liveRow || pendingRow || finalRow || cells.find(Boolean) || null;
        return {
            date,
            badge: statusRow?.badge || (session === 'historical' ? '기준일' : '확정'),
            badgeClass: statusRow?.badgeClass || (session === 'historical' ? 'historical' : 'final'),
            cells
        };
    });
}
function renderTableHead() {
    const kospiMetaText = getKospiMetaText();
    const slotInputs = appState.slots.map((slot) => `
        <th>
            <div class="table-slot-control">
                <input
                    id="stock-slot-${slot.id}"
                    class="table-slot-input"
                    data-slot-id="${slot.id}"
                    list="stock-catalog-list"
                    type="text"
                    value="${escapeHtml(slot.query)}"
                    placeholder="주식${slot.id}"
                >
                ${getSlotMetaText(slot) ? `<span class="table-slot-meta">${escapeHtml(getSlotMetaText(slot))}</span>` : ''}
            </div>
        </th>
    `).join('');
    getEl('table-head').innerHTML = `
        <tr class="input-row">
            <th></th>
            <th>
                <div class="table-fixed-note">
                    <strong>KOSPI</strong>
                    <span>${escapeHtml(kospiMetaText)}</span>
                </div>
            </th>
            ${slotInputs}
        </tr>
    `;
    updateEmptyStateCopy();
}
function renderTable(matrixRows) {
    const body = getEl('table-body');
    const empty = getEl('empty-state');
    if (!Array.isArray(matrixRows) || matrixRows.length === 0) {
        body.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    body.innerHTML = matrixRows.map((row) => {
        const dateCell = `
            <div class="date-stack">
                <strong>${formatDateLabel(row.date)}</strong>
                <span class="row-badge ${row.badgeClass}">${row.badge}</span>
            </div>
        `;
        const cells = row.cells.map((cell) => `<td><span class="eq-cell ${getValueTone(cell?.equalRate ?? 0)}">${formatPercent(cell?.equalRate)}</span></td>`).join('');
        return `<tr><td>${dateCell}</td>${cells}</tr>`;
    }).join('');
}

async function fetchSeriesCollection(adapter) {
    if (adapter?.syncSheetTargets) {
        try {
            const selectedCodes = appState.slots.map((slot) => {
                const resolved = slot?.stock || findLocalStock(slot?.query || '');
                return resolved?.code || '';
            });
            const selectedNames = appState.slots.map((slot) => {
                const resolved = slot?.stock || findLocalStock(slot?.query || '');
                return resolved?.name || String(slot?.query || '').trim();
            });
            await adapter.syncSheetTargets(selectedCodes, appState.selectedDate, selectedNames);
        } catch (error) {
            console.warn('sheet-sync-targets failed', error);
        }
    }
    const targets = [KOSPI_BENCHMARK, ...appState.slots.map((slot) => slot.stock)];
    const seriesCollection = await mapSequential(targets, async (target, index) => {
        if (!target) {
            return { slotId: index, target: null, series: null, rows: [], liveSnapshot: null };
        }
        const series = await adapter.loadSeries(target, appState.selectedDate, index);
        return { slotId: index, target, series, rows: [], liveSnapshot: null };
    }, GATEWAY_REQUEST_SPACING_MS);
    const holidaySet = new Set(seriesCollection.flatMap((item) => item.series?.holidays || []));
    let session = FORCE_SHEET_PIPELINE ? 'historical' : resolveMarketSession(appState.selectedDate, holidaySet);
    const shouldSkipInitialSnapshots = FORCE_SHEET_PIPELINE || (session === 'open' && shouldUseRealtimeStream());
    if (!FORCE_SHEET_PIPELINE && ['open', 'preopen', 'closed'].includes(session) && !shouldSkipInitialSnapshots) {
        const snapshots = await mapSequential(seriesCollection, async (item) => (
            item.target ? adapter.loadIntraday(item.target, appState.selectedDate) : null
        ), GATEWAY_REQUEST_SPACING_MS);
        const firstSnapshotWithSession = snapshots.find((snapshot) => snapshot?.session);
        if (firstSnapshotWithSession?.session) {
            session = firstSnapshotWithSession.session;
        }
        snapshots.forEach((snapshot, index) => {
            seriesCollection[index].liveSnapshot = snapshot;
        });
    }
    seriesCollection.forEach((item) => {
        item.rows = item.series ? buildComposedRows(item.series, item.liveSnapshot, session) : [];
    });
    return { seriesCollection, session };
}
async function refreshLiveSnapshots(adapter, existingSeriesCollection) {
    const seriesCollection = existingSeriesCollection.map((item) => ({
        ...item,
        rows: Array.isArray(item.rows) ? item.rows : [],
        liveSnapshot: item.liveSnapshot || null
    }));
    const holidaySet = new Set(seriesCollection.flatMap((item) => item.series?.holidays || []));
    let session = resolveMarketSession(appState.selectedDate, holidaySet);
    if (['open', 'preopen', 'closed'].includes(session)) {
        const snapshots = await mapSequential(seriesCollection, async (item) => (
            item.target ? adapter.loadIntraday(item.target, appState.selectedDate) : null
        ), GATEWAY_REQUEST_SPACING_MS);
        const firstSnapshotWithSession = snapshots.find((snapshot) => snapshot?.session);
        if (firstSnapshotWithSession?.session) {
            session = firstSnapshotWithSession.session;
        }
        snapshots.forEach((snapshot, index) => {
            seriesCollection[index].liveSnapshot = snapshot;
        });
    }
    seriesCollection.forEach((item) => {
        item.rows = item.series ? buildComposedRows(item.series, item.liveSnapshot, session) : [];
    });
    return { seriesCollection, session };
}
async function loadAndRender() {
    clearPolling();
    if (!appState.selectedDate) {
        renderStatusStrips();
        renderSelectionNote([]);
        renderTableHead();
        renderTable([]);
        return;
    }
    setLoading(true);
    try {
        await resolveSlots();
        const adapter = getActiveAdapter();
        const nextState = await fetchSeriesCollection(adapter);
        appState.seriesCollection = nextState.seriesCollection;
        appState.session = nextState.session;
        renderTableHead();
        renderLiveState();
        const actualEnd = getActualEndDate(appState.seriesCollection) || appState.selectedDate;
        getEl('table-description').textContent = `최근 ${DISPLAY_TRADING_DAY_WINDOW}영업일(최신일 ${actualEnd})만 역순으로 보여줍니다. 각 칸은 일별 등가률입니다.`;
        if (appState.session === 'open') {
            startRealtimeStreamOrPolling();
        }
    } catch (error) {
        console.error(error);
        renderStatusStrips();
        renderSelectionNote([]);
        renderTableHead();
        renderTable([]);
        getEl('empty-state').style.display = 'block';
        getEl('empty-state').textContent = `데이터를 불러오지 못했습니다. ${error.message}`;
    } finally {
        setLoading(false);
    }
}
async function handleSlotBlur(slotId) {
    const slot = appState.slots.find((item) => item.id === slotId);
    const input = getEl(`stock-slot-${slotId}`);
    if (!slot || !input) return;
    slot.query = String(input.value || '').trim();
    if (!slot.query) {
        slot.stock = null;
        persistSlots();
        renderTableHead();
        return;
    }
    try {
        const resolved = await resolveStock(slot.query);
        slot.stock = resolved ? enrichStockMeta(resolved) : null;
        if (slot.stock) {
            slot.query = slot.stock.name;
        }
        persistSlots();
        renderTableHead();
    } catch (error) {
        console.error('slot resolve failed', error);
    }
}
function bindEvents() {
    getEl('apply-btn').addEventListener('click', async () => {
        appState.selectedDate = getEl('reference-date').value;
        localStorage.setItem(STORAGE_LAST_DATE, appState.selectedDate);
        await loadAndRender();
    });
    getEl('refresh-btn').addEventListener('click', async () => {
        appState.selectedDate = getEl('reference-date').value;
        localStorage.setItem(STORAGE_LAST_DATE, appState.selectedDate);
        await loadAndRender();
    });
    getEl('reset-btn').addEventListener('click', async () => {
        appState.slots = createDefaultSlots();
        renderTableHead();
        persistSlots();
        await loadAndRender();
    });
    getEl('slot-count').addEventListener('change', async (event) => {
        const nextCount = normalizeSlotCount(event.target.value);
        if (nextCount === appState.slotCount) return;
        appState.slotCount = nextCount;
        appState.slots = buildSlotsForCount(nextCount, appState.slots);
        persistSlotCount();
        persistSlots();
        syncSlotCountInput();
        renderTableHead();
        await loadAndRender();
    });
    getEl('reference-date').addEventListener('change', async (event) => {
        appState.selectedDate = event.target.value;
        localStorage.setItem(STORAGE_LAST_DATE, appState.selectedDate);
        await loadAndRender();
    });
    document.addEventListener('blur', async (event) => {
        const input = event.target.closest('[data-slot-id]');
        if (!input) return;
        await handleSlotBlur(Number(input.dataset.slotId));
    }, true);
    document.addEventListener('keydown', async (event) => {
        const input = event.target.closest('[data-slot-id]');
        if (!input || event.key !== 'Enter') return;
        event.preventDefault();
        await handleSlotBlur(Number(input.dataset.slotId));
        appState.selectedDate = getEl('reference-date').value;
        await loadAndRender();
    });
}
function restoreState() {
    const today = getTodayKstDate();
    appState.selectedDate = localStorage.getItem(STORAGE_LAST_DATE) || today;
    appState.gatewayUrl = localStorage.getItem(STORAGE_GATEWAY) || DEFAULT_GATEWAY;
    appState.realtimeUrl = DEFAULT_REALTIME_URL;
    appState.slotCount = normalizeSlotCount(localStorage.getItem(STORAGE_SLOT_COUNT) || DEFAULT_SLOT_COUNT);
    getEl('reference-date').value = appState.selectedDate;
    getEl('reference-date').max = today;
    const savedSlots = localStorage.getItem(STORAGE_SLOTS);
    if (savedSlots) {
        try {
            const parsed = JSON.parse(savedSlots);
            if (Array.isArray(parsed) && parsed.length) {
                appState.slots = buildSlotsForCount(appState.slotCount, parsed);
            }
        } catch (error) {
            console.warn('failed to restore slots', error);
        }
    }
    if (!appState.slots.length) {
        appState.slots = createDefaultSlots();
    }
}
async function init() {
    restoreState();
    syncSlotCountInput();
    await ensureCatalogLoaded();
    renderStatusStrips();
    renderSelectionNote([]);
    renderTableHead();
    bindEvents();
    await loadAndRender();
}
window.addEventListener('beforeunload', clearPolling);
window.addEventListener('load', init);
