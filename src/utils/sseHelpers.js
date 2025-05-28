// src/utils/sseHelpers.js

/**
 * يهيّئ الاستجابة لـ SSE (يُستخدم مرة واحدة)
 * @param {import('express').Response} res
 * @param {number} [status=201]
 */
export function initSSE(res, status = 201) {
    res.status(status);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }
}

/**
 * تنسيق الوقت الحالي للطابع الزمني ونسق المنطقة الزمنية
 * @returns {{DateTime: number, DateTimeZone: {date: string, timezone_type: number, timezone: string}}}
 */
function getSSETimeData() {
    const now = new Date();
    const DateTime = Math.floor(now.getTime() / 1000);
    const date = now
        .toLocaleString('en-CA', {
            timeZone: 'Asia/Riyadh',
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        })
        .replace(',', '')
        .replace('T', ' ');
    return {
        DateTime,
        DateTimeZone: {
            date,
            timezone_type: 3,
            timezone: 'Asia/Riyadh'
        }
    };
}

/**
 * يرسل حدث JSON عبر SSE بنفس التنسيق
 * @param {import('express').Response} res
 * @param {object} payload - كائن JSON للإرسال
 */
function sendSSEJson(res, payload) {
    res.write(`event: json\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    if (typeof res.flush === 'function') {
        res.flush();
    }
}

/**
 * يبني ويرسل حدث JSON يحتوي على بيانات الثريد والمستخدم وحالة الضيف
 * @param {import('express').Response} res
 * @param {string} threadId
 * @param {string} userId
 * @param {boolean} isGuest
 */
export function sendSSEMetaThread(res, threadId, userId, isGuest) {
    const { DateTime, DateTimeZone } = getSSETimeData();
    const payload = {
        response: { status: 200, DateTime, DateTimeZone },
        data: { all: [{ threadId, userId, isGuest }] }
    };
    sendSSEJson(res, payload);
}

/**
 * يبني ويرسل حدث JSON يحتوي على بيانات الثريد والمستخدم فقط
 * @param {import('express').Response} res
 * @param {string} threadId
 * @param {string} userId
 */
export function sendSSEMetaMessage(res, threadId, userId) {
    const { DateTime, DateTimeZone } = getSSETimeData();
    const payload = {
        response: { status: 200, DateTime, DateTimeZone },
        data: { all: [{ threadId, userId }] }
    };
    sendSSEJson(res, payload);
}