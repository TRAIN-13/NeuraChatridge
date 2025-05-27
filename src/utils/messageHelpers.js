// src/utils/messageHelpers.js
import { flushAll } from '../services/messageService.js';
import logger from './logger.js';

// أقصى طول مسموح به للرسالة وصيغة المعرف
const MAX_MESSAGE_LENGTH = 1000;
const ID_REGEX = /^[a-zA-Z0-9_-]{5,50}$/;

export function normalizeAndValidateInput(body) {
  const userId   = body.userId   ?? body.user_Id;
  const threadId = body.threadId ?? body.thread_Id;
  const message  = (body.message || '').trim();

  if (!ID_REGEX.test(userId))   throw new Error('Invalid user ID format');
  if (!ID_REGEX.test(threadId)) throw new Error('Invalid thread ID format');
  if (!message)                 throw new Error('Message content is required');
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message exceeds ${MAX_MESSAGE_LENGTH} characters`);
  }

  return { userId, threadId, message };
}

export function setupConnectionCleanup(req, res, threadId) {
  let done = false;
  const cleanup = async () => {
    if (done) return;
    done = true;
    logger.warn('Client disconnected prematurely', {
      threadId,
      connectionDuration: Date.now() - req.startTime
    });
    try { await flushAll(threadId); }
    catch (err) {
      logger.error('Cleanup failed on client disconnect', { threadId, error: err.message });
    }
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('finish', cleanup);
}

export function sendErrorResponse(res, code, message, requestId) {
  res.write(`event: error\ndata:${JSON.stringify({ code, message, requestId, timestamp: new Date().toISOString() })}\n\n`);
  res.end();
}
