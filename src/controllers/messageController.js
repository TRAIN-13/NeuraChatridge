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

  try {
    // 1) التحقق من المدخلات وتوحيدها
    const { userId, threadId, message } = normalizeAndValidateInput(req.body);

    // 2) إذا وصل ملف صورة، ارفعه فوراً إلى S3 للحصول على URL
    let imageUrl;
    if (req.file?.buffer) {
      const uploadPromise = uploadFile(req.file.buffer);
      logger.debug('Image uploaded to S3', { 
        requestId, 
        threadId,
        imageUrl,
        uploadTime: `${Date.now() - startTime}ms`
      });
      const { url } = await uploadPromise;
      imageUrl = url;
    }

    logger.info('Processing new message', {
      requestId,
      userId,
      threadId,
      messageLength: message.length,
      hasImage: !!imageUrl
    });

    // 3) تهيئة SSE وإرسال حدث meta
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

    // 6) إرسال الرسالة إلى OpenAI مع مهلة زمنية
    try {
      await Promise.race([
        aiAddMessage(threadId, userPayload),
        setTimeout(OPENAI_TIMEOUT, new Error('OpenAI request timed out'))
      ]);
      logger.debug('Message sent to OpenAI', {
        requestId,
        threadId,
        hasImage: !!imageUrl,
        processingTime: `${Date.now() - startTime}ms`
      });
    } catch (timeoutErr) {
      logger.error('OpenAI request timed out', {
        requestId,
        threadId,
        error: timeoutErr.message,
        timeout: OPENAI_TIMEOUT
      });
      throw new Error('AI service is taking too long to respond');
    }

    // 7) حفظ رسالة المستخدم في Firestore وتحديث الطابع الزمني
    try {
      await addMessageInstant(threadId, 'user', message, imageUrl);
      await updateThreadTimestamp(threadId);
      logger.debug('Message saved to Firestore', {
        requestId,
        threadId
      });
    } catch (firestoreErr) {
      logger.error('Firestore update failed', {
        requestId,
        threadId,
        error: firestoreErr.message
      });
      // لا نوقف العملية لأن المشكلة في Firestore فقط
    }

    // 8) بدء بث SSE لردود المساعد
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
    const { code, message: errMsg } = sanitizeError(err);
    return sendErrorResponse(res, code, errMsg, requestId);
  }
}