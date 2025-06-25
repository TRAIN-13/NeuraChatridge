// src/controllers/threadController.js
import logger from '../utils/logger.js';
import { createAIThread } from '../services/openaiService.js';
import { createFSThread } from '../services/threadService.js';
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
  logger.debug('Entering createThread handler', {
    requestId,
    path: req.originalUrl,
    method: req.method
  });

  let threadId, userId, isGuest;
  try {
    const { user_Id: rawUserId, message } = req.body;
    logger.debug('Raw input received', { requestId, rawUserId, messageLength: message?.length });

    // Validate initial message
    if (!message || !message.trim()) {
      logger.warn('Invalid input: initial message is required', { requestId });
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Initial message is required' },
        requestId
      });
    }

    // Determine user identity
    isGuest = !rawUserId;
    if (isGuest) {
      userId = generateGuestUserId();
      logger.info('Generated guest user ID', { requestId, userId });
    } else {
      logger.debug('Validating provided user ID', { requestId, rawUserId });
      userId = validateUserId(rawUserId);
      logger.info('Provided user ID validated', { requestId, userId });
    }

    // Create AI thread
    logger.info('Creating AI thread', { requestId });
    threadId = await createAIThread();
    logger.info('AI thread created', { requestId, threadId });

    // Create Firestore thread document
    logger.debug('Creating Firestore thread document', { requestId, threadId, userId, isGuest });
    await createFSThread(userId, threadId, isGuest);
    logger.info('Firestore thread document created', { requestId, threadId });

    // Handle initial message
    logger.debug('Handling initial message', { requestId, threadId });
    await handleInitialMessage(threadId, message.trim(), requestId);
    logger.info('Initial message processed', { requestId, threadId });

  } catch (err) {
    logger.error('Thread creation failed', {
      requestId,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    const safeError = sanitizeError(err, req);
    logger.debug('Sending error response for createThread', { requestId, safeError });
    return res.status(500).json({ success: false, error: safeError, requestId });
  } finally {
    logOperationSuccess(startTime, requestId);
  }

  // Initialize SSE and stream responses
  logger.debug('Initializing SSE for new thread', { requestId, threadId, userId, isGuest });
  initSSE(res);
  sendSSEMetaThread(res, threadId, userId, isGuest);
  logger.info('SSE metadata sent', { requestId, threadId, userId, isGuest });

  logger.debug('Starting SSE stream for thread', { requestId, threadId });
  return runThreadStream(threadId, req, res);
}