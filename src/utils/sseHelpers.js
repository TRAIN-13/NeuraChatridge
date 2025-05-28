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
 * يبني ويرسل حدث meta بصيغة JSON يتضمن التاريخ والوقت والمنطقة الزمنية وبيانات الثريد والمستخدم والوضع الضيف
 * @param {import('express').Response} res - استجابة Express
 * @param {string} threadId - معرف الثريد
 * @param {string} userId - معرف المستخدم
 * @param {boolean} isGuest - ما إذا كان المستخدم ضيفاً
 */
export function sendSSEMeta(res, threadId, userId, isGuest) {
    const now = new Date();
    const epoch = Math.floor(now.getTime() / 1000);
    const localDate = now
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
    const tzName = 'Asia/Riyadh';

    const payload = {
        response: {
            status: 200,
            DateTime: epoch,
            DateTimeZone: {
                date: localDate,
                timezone_type: 3,
                timezone: tzName
            }
        },
        data: {
            all: [
                {
                    threadId,
                    userId,
                    isGuest
                }
            ]
        }
    };

    res.write(`event: json\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    if (typeof res.flush === 'function') {
        res.flush();
    }
}
