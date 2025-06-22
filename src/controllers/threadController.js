// src/controllers/threadController.js

import logger from '../utils/logger.js';
import {
  createAIThread
} from '../services/openaiService.js';
import {
  createFSThread
} from '../services/threadService.js';
import { runThreadStream } from '../services/streamService.js';
import {
  generateGuestUserId,
  validateUserId,
  handleInitialMessage,
  logOperationSuccess
} from '../utils/threadHelpers.js';
import { sanitizeError } from '../utils/errorUtils.js';
import { initSSE, sendSSEMetaThread } from '../utils/sseHelpers.js';

/**
 * POST /api/threads
 */

export async function createThread(req, res, next) {
  const { requestId } = req;
  const startTime = Date.now();

  // 1) التحقق وإنشاء الثريد وغرف الميتاداتا ومعالجة الرسالة الابتدائية
  let threadId, userId, isGuest;
  try {
    const { user_Id: rawUserId, message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Initial message is required' },
        requestId
      });
    }

    isGuest = !rawUserId;
    userId = isGuest
      ? generateGuestUserId()
      : validateUserId(rawUserId);

    logger.info('Creating thread', { requestId, userId, isGuest });

    threadId = await createAIThread();
    await createFSThread(userId, threadId, isGuest);

    logger.debug('External services initialized', { requestId, threadId });

    // معالجة الرسالة الابتدائية قبل إرسال الهيدرز
    await handleInitialMessage(threadId, message.trim(), requestId);
  } catch (err) {
    logger.error('Thread creation failed', {
      requestId,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    const safeError = sanitizeError(err, req);
    return res.status(500).json({ success: false, error: safeError, requestId });
  } finally {
    logOperationSuccess(startTime, requestId);
  }

  // 2) بعد تأكد نجاح كل الخطوات السابقة؛ افتح قناة الـ SSE ولا تُدخل هذا الجزء في كتلة الخطأ
  initSSE(res);
  sendSSEMetaThread(res, threadId, userId, isGuest);
  return runThreadStream(threadId, req, res);
}