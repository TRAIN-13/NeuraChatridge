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

  // 2. استدعاء OpenAI Stream
  openaiStream(threadId, {
    onTextDelta: chunk => {
      try {
        // أرسل الحزمة فورياً
        res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
        res.flush?.();

        // خزّن في Firestore buffer
        bufferMessage(threadId, "assistant", chunk);
      } catch (err) {
        console.error("Buffer error (ignored):", err);
      }
    },
    onEnd: async () => {
      try {
        await flushAll(threadId);
      } catch (err) {
        console.error("Flush onEnd error:", err);
      }
      res.write("event: end\ndata: done\n\n");
      res.end();
    },
    onError: async err => {
      console.error("Stream error:", err);
      try {
        await flushAll(threadId);
      } catch (flushErr) {
        console.error("Flush onError error:", flushErr);
      }
      delete req.session.threadId;
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  });
}
