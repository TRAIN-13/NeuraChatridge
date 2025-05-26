// src/controllers/messageController.js
import { aiAddMessage } from '../services/openaiService.js';
import { addMessageInstant, bufferMessage, flushAll } from '../services/messageService.js';
import { updateThreadTimestamp } from '../services/threadService.js';
import { runThreadStream } from '../services/streamService.js';

/**
 * POST /api/create-messages
 * Streams assistant responses via SSE and uploads user messages immediately,
 * batching assistant replies in groups of n for Firestore.
 */
export async function addMessage(req, res) {
  // 1. Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders?.();

  try {
    const { userId, threadId, message, metaData } = req.body;
    if (!userId || !threadId || !message?.trim()) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'userId, threadId, and message are required' })}\n\n`);
      return res.end();
    }

    // 2. Persist user message immediately إلى Firestore
    await addMessageInstant(threadId, 'user', message);

    // 3. أرسل للمساعد وابدأ الستريم
    await aiAddMessage(threadId, message);

    // 4. حدّث توقيت الثريد
    await updateThreadTimestamp(threadId);

    // 6. Stream assistant responses, batching n items before writing to Firestore
    return runThreadStream(threadId, req, res);
    
  } catch (err) {
    console.error('addMessage error:', err);
    // Flush any remaining buffered messages
    await flushAll(req.body.threadId);
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
}
