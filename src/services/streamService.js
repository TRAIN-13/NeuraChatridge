// src/services/streamService.js
import { streamThread as openaiStream } from './openaiService.js';
import { bufferMessage, flushAll } from './messageService.js';

/**
 * تبدأ ستريم SSE على ثريد مع OpenAI وترفع الحزم إلى Firestore.
 *
 * @param {string} threadId
 * @param {object} req      - كائن Express request (للوصول للـ session)
 * @param {object} res      - كائن Express response
 */
export function runThreadStream(threadId, req, res) {
  // 2. استدعاء OpenAI Stream مرة واحدة مع مجموعة الـ callbacks المعرفة هنا
 const stream = openaiStream(threadId, {
   onTextDelta: chunk => {
     try {
       // 1) احصل على الطابع الزمني المطلق (ms since Unix epoch)
       const timestampMs = Date.now();

       // 3) خزّن في Firestore buffer مع النص والطابع الزمني
       bufferMessage(threadId, 'assistant', chunk, timestampMs);
     } catch (err) {
       console.error('Buffer error (ignored):', err);
     }
   },
   onEnd: async () => {
      try {
        await flushAll(threadId);
      } catch (err) {
        console.error('Flush onEnd error:', err);
      }
      res.write('event: end\ndata: done\n\n');
      res.end();
    },
    onError: async err => {
      console.error('Stream error:', err);
      try {
        await flushAll(threadId);
      } catch (flushErr) {
        console.error('Flush onError error:', flushErr);
      }
      // نظّف الجلسة
      delete req.session.threadId;
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  });

  // 3. رصد قطع اتصال العميل لتنظيف الموارد فوراً
  req.on('close', async () => {
    console.log(`Client disconnected from thread ${threadId}`);
    // إيقاف البث إن أمكن
    stream.stop?.();
    // إفراغ أي buffers متبقية
    await flushAll(threadId);
    res.end();
    // (قد لا تحتاج إلى res.end() لأن العميل قطع الاتصال بالفعل)
  });
}
