// src/controllers/messageController.js
import { aiAddMessage } from '../services/openaiService.js';
import { addMessageInstant, bufferMessage, flushAll } from '../services/messageService.js';
import { updateThreadTimestamp } from '../services/threadService.js';
import { runThreadStream } from '../services/streamService.js';

/**
 * Sanitizes error details before exposing to clients.
 * In production hides the real message to prevent data exposure.
 */
function sanitizeError(err) {
  return {
    code: err.code || 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  };
}

/**
 * POST /api/create-messages
 * Streams assistant responses via SSE and uploads user messages immediately,
 * batching assistant replies in groups of n for Firestore.
 */
export async function addMessage(req, res) {
  // Handle client disconnects to clean up buffers
  const { user_Id, thread_Id } = req.body;
  const origThread = thread_Id;
  req.on('close', async () => {
    console.log(`Client disconnected for thread ${origThread}`);
    await flushAll(origThread);
  });

  try {
    // Normalize request fields
    const userId = req.body.userId ?? user_Id;
    const threadId = req.body.threadId ?? thread_Id;
    const message = req.body.message?.trim();

    // Validate inputs
    if (!userId || !threadId || !message) {
      const errPayload = { code: 'INVALID_INPUT', message: 'userId, threadId, and message are required' };
      res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
      return res.end();
    }

    // Persist user message immediately
    await addMessageInstant(threadId, 'user', message);

    // Send to OpenAI and update thread timestamp
    await aiAddMessage(threadId, message);
    await updateThreadTimestamp(threadId);

    // Begin SSE stream for assistant replies
    return runThreadStream(threadId, req, res);

  } catch (err) {
    console.error('addMessage error:', err);
    // Flush any remaining assistant buffers
    await flushAll(req.body.threadId);

    // Sanitize before sending
    const { code, message } = sanitizeError(err);
    res.write(`event: error\ndata: ${JSON.stringify({ code, message })}\n\n`);
    return res.end();
  }
}
