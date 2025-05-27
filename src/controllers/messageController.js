// src/controllers/messageController.js
import logger from '../utils/logger.js';
import { aiAddMessage } from '../services/openaiService.js';
import {
  addMessageInstant,
  flushAll
} from '../services/messageService.js';
import { updateThreadTimestamp } from '../services/threadService.js';
import { runThreadStream } from '../services/streamService.js';
import { sanitizeError } from '../utils/errorUtils.js';
import {
  normalizeAndValidateInput,
  setupConnectionCleanup,
  sendErrorResponse
} from '../utils/messageHelpers.js';

/**
 * POST /api/create-messages
 * يرفع رسالة المستخدم فورياً، يرسلها إلى مساعد OpenAI، ثم يبدأ تدفق الردود عبر SSE
 */
export async function addMessage(req, res) {
  const { requestId } = req;
  const startTime = Date.now();

  try {
    // 1) التحقق من المدخلات وتوحيدها
    const { userId, threadId, message } = normalizeAndValidateInput(req.body);

    logger.info('Processing new message', {
      requestId,
      userId,
      threadId,
      messageLength: message.length
    });

    // 2) حفظ رسالة المستخدم وإرسالها للمساعد وتحديث طابع الثريد
    await Promise.all([
      addMessageInstant(threadId, 'user', message),
      aiAddMessage(threadId, message),
      updateThreadTimestamp(threadId)
    ]);

    logger.debug('Message processing completed', {
      requestId,
      threadId,
      processingTime: `${Date.now() - startTime}ms`
    });

    // 3) ربط تنظيف موارد التخزين المؤقت عند انقطاع الاتصال
    setupConnectionCleanup(req, res, threadId);

    // 4) بدء بث SSE لردود المساعد
    return runThreadStream(threadId, req, res);

  } catch (err) {
    // تسجيل الخطأ مركزيًّا
    logger.error('Message processing failed', {
      requestId,
      threadId: req.body.threadId ?? req.body.thread_Id,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // تفريغ أي رسائل باقية في البافر
    await flushAll(req.body.threadId ?? req.body.thread_Id);

    // تنقية الخطأ وإرساله للعميل
    const { code, message } = sanitizeError(err);
    return sendErrorResponse(res, code, message, requestId);
  }
}