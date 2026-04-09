import http from 'node:http';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8787);
const KIS_BASE_URL = process.env.KIS_BASE_URL || 'https://openapi.koreainvestment.com:9443';
const KIS_WS_URL = process.env.KIS_WS_URL || 'ws://ops.koreainvestment.com:21000/tryitout';
const KIS_APP_KEY = String(process.env.KIS_APP_KEY || '').trim();
const KIS_APP_SECRET = String(process.env.KIS_APP_SECRET || '').trim();
const SSE_KEEPALIVE_MS = Number(process.env.SSE_KEEPALIVE_MS || 15000);
const SUBSCRIBE_DELAY_MS = Number(process.env.SUBSCRIBE_DELAY_MS || 80);
const MAX_CODES = Number(process.env.MAX_CODES || 8);

const KOSPI_INDEX_CODE = '0001';
const STOCK_TRADE_TR_ID = 'H0STCNT0';
const INDEX_TRADE_TR_ID = 'H0UPCNT0';
const STOCK_TRADE_FIELD_COUNT = 46;
const INDEX_TRADE_FIELD_COUNT = 30;

function todayKstDate() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(new Date());
}

function nowKstTimestamp() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(new Date())
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`;
}

function roundNumber(value, digits = 8) {
    if (!Number.isFinite(value)) return null;
    return Number(value.toFixed(digits));
}

function toNumber(value) {
    const normalized = String(value ?? '').trim().replace(/,/g, '');
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function derivePreviousClose(price, ratePercent, diffValue, signCode) {
    if (Number.isFinite(price) && Number.isFinite(ratePercent) && ratePercent > -100) {
        return roundNumber(price / (1 + (ratePercent / 100)));
    }
    if (Number.isFinite(price) && Number.isFinite(diffValue)) {
        if (signCode === '2' || signCode === '1') return roundNumber(price - diffValue);
        if (signCode === '5' || signCode === '4') return roundNumber(price + Math.abs(diffValue));
        if (signCode === '3') return roundNumber(price);
    }
    return null;
}

function normalizeCodes(rawCodes) {
    return String(rawCodes || '')
        .split(',')
        .map((code) => code.trim().replace(/^KRX:/i, '').replace(/[^A-Z0-9]/gi, '').toUpperCase())
        .filter(Boolean)
        .filter((code, index, source) => source.indexOf(code) === index)
        .slice(0, MAX_CODES);
}

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify(payload));
}

function sendSse(response, payload) {
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function fetchApprovalKey() {
    if (!KIS_APP_KEY || !KIS_APP_SECRET) {
        throw new Error('KIS_APP_KEY 와 KIS_APP_SECRET 환경변수가 필요합니다.');
    }
    const response = await fetch(`${KIS_BASE_URL}/oauth2/Approval`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Accept: 'application/json'
        },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            appkey: KIS_APP_KEY,
            secretkey: KIS_APP_SECRET
        })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.approval_key) {
        throw new Error(payload?.msg1 || payload?.message || '웹소켓 approval_key 발급에 실패했습니다.');
    }
    return payload.approval_key;
}

function buildSubscribeMessage(approvalKey, trId, trKey) {
    return JSON.stringify({
        header: {
            approval_key: approvalKey,
            custtype: 'P',
            tr_type: '1',
            'content-type': 'utf-8'
        },
        body: {
            input: {
                tr_id: trId,
                tr_key: trKey
            }
        }
    });
}

function parseStockSnapshot(fields, selectedDate) {
    const code = String(fields[0] || '').trim();
    const price = toNumber(fields[2]);
    const diffValue = toNumber(fields[4]);
    const ratePercent = toNumber(fields[5]);
    const prevClose = derivePreviousClose(price, ratePercent, diffValue, String(fields[3] || '').trim());
    if (!code || !Number.isFinite(price)) return null;
    return {
        type: 'snapshot',
        assetType: 'stock',
        code,
        date: selectedDate,
        price,
        prevClose,
        equalRate: Number.isFinite(ratePercent) ? roundNumber(ratePercent / 100) : (
            Number.isFinite(price) && Number.isFinite(prevClose) && prevClose !== 0
                ? roundNumber((price / prevClose) - 1)
                : null
        ),
        asOf: nowKstTimestamp(),
        session: 'open'
    };
}

function parseIndexSnapshot(fields, selectedDate) {
    const code = String(fields[0] || '').trim();
    const price = toNumber(fields[2]);
    const diffValue = toNumber(fields[4]);
    const ratePercent = toNumber(fields[9]);
    const prevClose = derivePreviousClose(price, ratePercent, diffValue, String(fields[3] || '').trim());
    if (!code || !Number.isFinite(price)) return null;
    return {
        type: 'snapshot',
        assetType: 'index',
        code,
        date: selectedDate,
        price,
        prevClose,
        equalRate: Number.isFinite(ratePercent) ? roundNumber(ratePercent / 100) : (
            Number.isFinite(price) && Number.isFinite(prevClose) && prevClose !== 0
                ? roundNumber((price / prevClose) - 1)
                : null
        ),
        asOf: nowKstTimestamp(),
        session: 'open'
    };
}

function parseRealtimeFrames(rawMessage, selectedDate) {
    const text = String(rawMessage || '');
    if (!text || (text[0] !== '0' && text[0] !== '1')) return [];
    const sections = text.split('|');
    const trId = String(sections[1] || '').trim();
    const frameCount = Math.max(1, Number(sections[2] || 1));
    const payload = String(sections[3] || '');
    const fields = payload.split('^');
    const fieldCount = trId === INDEX_TRADE_TR_ID ? INDEX_TRADE_FIELD_COUNT : (
        trId === STOCK_TRADE_TR_ID ? STOCK_TRADE_FIELD_COUNT : 0
    );
    if (!fieldCount) return [];
    const snapshots = [];
    for (let index = 0; index < frameCount; index += 1) {
        const offset = index * fieldCount;
        const frame = fields.slice(offset, offset + fieldCount);
        if (frame.length < fieldCount) break;
        const snapshot = trId === INDEX_TRADE_TR_ID
            ? parseIndexSnapshot(frame, selectedDate)
            : parseStockSnapshot(frame, selectedDate);
        if (snapshot) {
            snapshots.push(snapshot);
        }
    }
    return snapshots;
}

async function openKisRealtimeStream({ codes, selectedDate, onSnapshot, onError, onSystemMessage }) {
    const approvalKey = await fetchApprovalKey();
    const socket = new WebSocket(KIS_WS_URL, {
        handshakeTimeout: 10000
    });

    let isClosed = false;

    const close = () => {
        if (isClosed) return;
        isClosed = true;
        try {
            socket.close();
        } catch (error) {
            console.warn('socket close failed', error);
        }
    };

    await new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
    });

    socket.on('message', (buffer) => {
        const rawMessage = buffer.toString();
        if (rawMessage.startsWith('{')) {
            try {
                const payload = JSON.parse(rawMessage);
                const trId = String(payload?.header?.tr_id || '').trim();
                if (trId === 'PINGPONG') {
                    socket.pong(Buffer.from(rawMessage));
                    return;
                }
                if (payload?.body?.rt_cd && String(payload.body.rt_cd) !== '0') {
                    onError(new Error(payload?.body?.msg1 || 'KIS websocket error'));
                    return;
                }
                onSystemMessage?.(payload);
                return;
            } catch (error) {
                onError(error);
                return;
            }
        }
        const snapshots = parseRealtimeFrames(rawMessage, selectedDate);
        snapshots.forEach((snapshot) => onSnapshot(snapshot));
    });

    socket.on('error', (error) => {
        if (isClosed) return;
        onError(error);
    });

    socket.on('close', () => {
        if (isClosed) return;
        onError(new Error('KIS websocket connection closed.'));
    });

    for (const code of codes) {
        const trId = code === KOSPI_INDEX_CODE ? INDEX_TRADE_TR_ID : STOCK_TRADE_TR_ID;
        socket.send(buildSubscribeMessage(approvalKey, trId, code));
        await delay(SUBSCRIBE_DELAY_MS);
    }

    return { close };
}

const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (requestUrl.pathname === '/health') {
        sendJson(response, 200, {
            ok: true,
            service: 'stock-lab-realtime-relay',
            now: nowKstTimestamp(),
            hasCredentials: Boolean(KIS_APP_KEY && KIS_APP_SECRET),
            kisWsUrl: KIS_WS_URL
        });
        return;
    }

    if (requestUrl.pathname !== '/stream') {
        sendJson(response, 404, {
            ok: false,
            error: '지원하지 않는 경로입니다.'
        });
        return;
    }

    const selectedDate = String(requestUrl.searchParams.get('date') || todayKstDate()).trim();
    const codes = normalizeCodes(requestUrl.searchParams.get('codes'));

    if (!codes.length) {
        sendJson(response, 400, {
            ok: false,
            error: 'codes 파라미터가 필요합니다.'
        });
        return;
    }

    response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no'
    });

    const heartbeat = setInterval(() => {
        response.write(': keepalive\n\n');
    }, SSE_KEEPALIVE_MS);

    let connection = null;
    let isClosed = false;

    const closeStream = () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(heartbeat);
        if (connection) {
            connection.close();
        }
        response.end();
    };

    request.on('close', closeStream);
    request.on('aborted', closeStream);

    sendSse(response, {
        type: 'session',
        session: 'open',
        transport: 'kis-websocket-relay'
    });

    try {
        connection = await openKisRealtimeStream({
            codes,
            selectedDate,
            onSnapshot(snapshot) {
                if (isClosed) return;
                sendSse(response, snapshot);
            },
            onSystemMessage(payload) {
                if (isClosed) return;
                const message = String(payload?.body?.msg1 || '').trim();
                if (!message) return;
                sendSse(response, {
                    type: 'status',
                    message
                });
            },
            onError(error) {
                if (isClosed) return;
                sendSse(response, {
                    type: 'error',
                    message: error?.message || '실시간 릴레이 오류가 발생했습니다.'
                });
                closeStream();
            }
        });
    } catch (error) {
        clearInterval(heartbeat);
        sendSse(response, {
            type: 'error',
            message: error?.message || '실시간 릴레이 시작에 실패했습니다.'
        });
        response.end();
    }
});

server.listen(PORT, HOST, () => {
    console.log(`stock-lab realtime relay listening on http://${HOST}:${PORT}`);
});
