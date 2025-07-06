// src/controllers/messageController.js
import logger from '../utils/logger.js';
import { aiAddMessage } from '../services/openaiService.js';
import { addMessageInstant, flushAll } from '../services/messageService.js';
import { updateThreadTimestamp, getUserMessageCount } from '../services/threadService.js';
import { runThreadStream } from '../services/streamService.js';
import { initSSE, sendSSEMetaMessage, sendSSEError } from '../utils/sseHelpers.js';
import { ValidationError, RateLimitError, ProcessingError } from '../utils/appError.js';
import { ERROR_CODES } from '../utils/errorCodes.js';
import { uploadFile } from '../services/s3Service.js';
import { setTimeout as timerSetTimeout } from 'timers/promises';

const MAX_USER_MESSAGES = parseInt(process.env.MAX_USER_MESSAGES || '20', 10);
const OPENAI_TIMEOUT = parseInt(process.env.OPENAI_TIMEOUT || '30000', 10);

export async function addMessage(req, res) {
  const { requestId, locale } = req;
  const startTime = Date.now();
  const { userId, threadId, message: messageContent } = req.validated;

  logger.info('Processing new message', { requestId, userId, threadId });

  // 0. Rate limit check
  const count = await getUserMessageCount(threadId);
  if (count >= MAX_USER_MESSAGES) {
    throw new RateLimitError(
      ERROR_CODES.VALIDATION.MESSAGE_LIMIT,
      { max: MAX_USER_MESSAGES, actual: count, locale }
    );
  }

  // 1. Optional image upload
  let imageUrl = null;
  if (req.file?.buffer) {
    try {
      const { url } = await uploadFile(req.file.buffer);
      imageUrl = url;
      logger.info('Image uploaded', { requestId, threadId, imageUrl });
    } catch (err) {
      throw new ProcessingError(
        ERROR_CODES.INTERNAL.UNEXPECTED,
        { locale, original: err.message }
      );
    }
  }

  // 2. Persist user message
  await addMessageInstant(threadId, 'user', messageContent, imageUrl);
  await updateThreadTimestamp(threadId);

  // 3. Initialize SSE
  initSSE(res);
  sendSSEMetaMessage(res, threadId, userId, locale);

  // 4. Background AI send
  setImmediate(async () => {
    try {
      await Promise.race([
        aiAddMessage(threadId, { role: 'user', content: [{ type: 'text', text: messageContent }, ...(imageUrl ? [{ type: 'image_url', image_url: { url: imageUrl } }] : [])] }),
        timerSetTimeout(OPENAI_TIMEOUT).then(() => { throw new Error('OPENAI_TIMEOUT'); })
      ]);
    } catch (err) {
      sendSSEError(res, err, locale);
    }
  });

  // 5. Main streaming
  try {
    runThreadStream(threadId, req, res);
  } catch (err) {
    throw new ProcessingError(
      ERROR_CODES.INTERNAL.UNEXPECTED,
      { locale, original: err.message }
    );
  } finally {
    const duration = Date.now() - startTime;
    logger.info('addMessage handler completed', { requestId, duration: `${duration}ms` });
  }
}
