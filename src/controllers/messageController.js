import logger from '../utils/logger.js';
import { aiAddMessage } from '../services/openaiService.js';
import { addMessageInstant, flushAll } from '../services/messageService.js';
import { updateThreadTimestamp } from '../services/threadService.js';
import { runThreadStream } from '../services/streamService.js';
import { sanitizeError } from '../utils/errorUtils.js';
import {
  normalizeAndValidateInput,
  setupConnectionCleanup,
  sendErrorResponse
} from '../utils/messageHelpers.js';

export async function addMessage(req, res) {
  const { requestId } = req;
  const startTime = Date.now();

  try {
    const { userId, threadId, message } = normalizeAndValidateInput(req.body);

    logger.info('Processing new message', { requestId, userId, threadId, messageLength: message.length });

    // 1) التوازي بين الحفظ والإرسال
    await Promise.all([
      addMessageInstant(threadId, 'user', message),
      aiAddMessage(threadId, message),
      updateThreadTimestamp(threadId)
    ]);

    logger.debug('Message processing completed', { requestId, threadId, processingTime: Date.now() - startTime });

    // 2) ربط التنظيف عند انقطاع الاتصال
    setupConnectionCleanup(req, res, threadId);

    // 3) بدء تدفق SSE
    return runThreadStream(threadId, req, res);

  } catch (err) {
    // التعامل المركزي مع الخطأ
    logger.error('Message processing failed', {
      requestId,
      threadId: req.body.threadId ?? req.body.thread_Id,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // محاولة تفريغ أي رسائل في buffer
    await flushAll(req.body.threadId ?? req.body.thread_Id);

    // تنقية الخطأ وإرساله
    const { code, message } = sanitizeError(err);
    sendErrorResponse(res, code, message, requestId);
  }
}