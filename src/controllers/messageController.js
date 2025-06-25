// src/controllers/messageController.js
import logger from '../utils/logger.js';
import { aiAddMessage } from '../services/openaiService.js';
import { addMessageInstant, flushAll } from '../services/messageService.js';
import { updateThreadTimestamp } from '../services/threadService.js';
import { runThreadStream } from '../services/streamService.js';
import { sanitizeError } from '../utils/errorUtils.js';
import { normalizeAndValidateInput, setupConnectionCleanup, sendErrorResponse } from '../utils/messageHelpers.js';
import { initSSE, sendSSEMetaMessage } from '../utils/sseHelpers.js';
import { uploadFile } from '../services/s3Service.js';
import { setTimeout } from 'timers/promises';

// مهلة زمنية للاستدعاءات (30 ثانية)
const OPENAI_TIMEOUT = 30000;

/**
 * POST /api/create-messages
 * يرفع رسالة المستخدم فورياً، يرسلها إلى مساعد OpenAI، ثم يبدأ تدفق الردود عبر SSE
 */
export async function addMessage(req, res) {
  const { requestId } = req;
  const startTime = Date.now();
  logger.debug('Entering addMessage handler', { requestId, path: req.originalUrl, method: req.method });

  try {
    // 1) التحقق من المدخلات وتوحيدها
    logger.debug('Validating input', { requestId, body: req.body });
    const { userId, threadId, message } = normalizeAndValidateInput(req.body);

    // 2) إذا وصل ملف صورة، ارفعه فوراً إلى S3 للحصول على URL
    let imageUrl = null;
    if (req.file?.buffer) {
      logger.debug('Detected image buffer, uploading to S3', {
        requestId,
        threadId,
        filename: req.file.originalname
      });
      const uploadStart = Date.now();
      const { url } = await uploadFile(req.file.buffer);
      imageUrl = url;
      logger.info('Image uploaded to S3', {
        requestId,
        threadId,
        filename: req.file.originalname,
        imageUrl,
        uploadDuration: `${Date.now() - uploadStart}ms`
      });
    }

    logger.info('Processing new message', {
      requestId,
      userId,
      threadId,
      messageLength: message.length,
      hasImage: Boolean(imageUrl)
    });

    // 3) تهيئة SSE وإرسال حدث meta
    logger.debug('Initializing SSE', { requestId, threadId, userId });
    initSSE(res);
    sendSSEMetaMessage(res, threadId, userId);

    // 4) ربط تنظيف موارد التخزين المؤقت عند انقطاع الاتصال
    setupConnectionCleanup(req, res, threadId);

    // 5) بناء محتوى الرسالة
    const segments = [{ type: 'text', text: message }];
    if (imageUrl) {
      segments.push({ type: 'image_url', image_url: { url: imageUrl } });
    }
    const userPayload = { role: 'user', content: segments };
    logger.debug('Prepared user payload for OpenAI', { requestId, threadId, userPayload });

    // 6) إرسال الرسالة إلى OpenAI مع مهلة زمنية
    try {
      logger.debug('Sending message to OpenAI', { requestId, threadId });
      await Promise.race([
        aiAddMessage(threadId, userPayload),
        setTimeout(OPENAI_TIMEOUT).then(() => { throw new Error('OpenAI request timed out'); })
      ]);
      logger.info('OpenAI request succeeded', { requestId, threadId });
    } catch (err) {
      logger.error('Error during OpenAI request', {
        requestId,
        threadId,
        error: err.message
      });
      throw err;
    }

    // 7) حفظ رسالة المستخدم وتحديث طابع الثريد
    try {
      logger.debug('Saving user message to Firestore', { requestId, threadId });
      const saveStart = Date.now();
      await addMessageInstant(threadId, 'user', message, imageUrl);
      await updateThreadTimestamp(threadId);
      logger.info('User message saved to Firestore', { requestId, threadId, saveDuration: `${Date.now() - saveStart}ms` });
    } catch (err) {
      logger.warn('Failed to save user message or update timestamp', {
        requestId,
        threadId,
        error: err.message
      });
    }

    // 8) بدء بث SSE لردود المساعد
    logger.debug('Starting SSE stream for assistant responses', { requestId, threadId });
    const result = runThreadStream(threadId, req, res);
    logger.debug('runThreadStream invoked', { requestId, threadId });
    return result;

  } catch (err) {
    // تسجيل الخطأ مركزيًّا
    logger.error('Message processing failed in addMessage', {
      requestId,
      path: req.originalUrl,
      error: err.message,
      stack: err.stack
    });

    // تفريغ أي رسائل باقية في البافر
    try {
      await flushAll(req.body.threadId ?? req.body.thread_Id);
      logger.debug('Flushed remaining message buffers after failure', { requestId });
    } catch (flushErr) {
      logger.error('Error flushing buffers after failure', { requestId, error: flushErr.message });
    }

    // تنقية الخطأ وإرساله للعميل
    const { code, message: errMsg } = sanitizeError(err);
    return sendErrorResponse(res, code, errMsg, requestId);

  } finally {
    const totalTime = Date.now() - startTime;
    logger.info('addMessage handler completed', { requestId, totalTime: `${totalTime}ms` });
  }
}