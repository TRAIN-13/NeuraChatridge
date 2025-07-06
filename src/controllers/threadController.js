// src/controllers/threadController.js
import logger from '../utils/logger.js';
import { createAIThread } from '../services/openaiService.js';
import { createFSThread } from '../services/threadService.js';
import { runThreadStream } from '../services/streamService.js';
import { generateGuestUserId, validateUserId, handleInitialMessage } from '../utils/threadHelpers.js';
import { ValidationError, NotFoundError, ProcessingError } from '../utils/appError.js';
import { ERROR_CODES } from '../utils/errorCodes.js';
import { initSSE, sendSSEMetaThread } from '../utils/sseHelpers.js';

/**
 * Create a new chat thread, send SSE metadata,
 * process the initial message asynchronously, and start AI streaming.
 */
export async function createThread(req, res) {
  const { requestId, locale } = req;
  const { user_Id: rawUserId, message } = req.validated;
  const messageContent = message.trim();
  const isGuest = !rawUserId;
  const userId = isGuest ? generateGuestUserId() : validateUserId(rawUserId);

  logger.info('Starting thread creation', { requestId, userId, isGuest });

  // 1. Create AI thread and Firestore document
  let threadId;
  try {
    threadId = await createAIThread();
  } catch (err) {
    throw new ProcessingError(
      ERROR_CODES.OPENAI.TIMEOUT,
      { locale, original: err.message }
    );
  }

  await createFSThread(userId, threadId, isGuest);
  logger.info('Thread created', { requestId, threadId });

  // 2. Initialize SSE and send metadata
  initSSE(res);
  sendSSEMetaThread(res, threadId, userId, isGuest, locale);

  // 3. Process initial message in background
  setImmediate(async () => {
    try {
      await handleInitialMessage(threadId, messageContent, requestId);
      logger.info('Initial message processed', { requestId, threadId });
    } catch (err) {
      sendSSEError(res, err, locale);
    }
  });

  // 4. Start AI streaming
  runThreadStream(threadId, req, res);
}
