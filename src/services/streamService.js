// src/services/streamService.js
import logger from '../utils/logger.js';
import { streamThread as openaiStream } from './openaiService.js';
import { bufferMessage, flushAll } from './messageService.js';
import { sendSSEError } from '../utils/sseHelpers.js';

/**
 * Start an SSE stream for a thread with OpenAI and flush messages to Firestore.
 * @param {string} threadId - ID of the thread to stream
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {import('openai').Stream} The OpenAI stream instance
 */
export function runThreadStream(threadId, req, res) {
  const { requestId, locale } = req;
  logger.debug('Entering runThreadStream', { requestId, threadId });

  // Initialize SSE headers
  res.write(`event: start\ndata:${JSON.stringify({ threadId, requestId })}\n\n`);

  const stream = openaiStream(threadId, {
    onTextDelta: chunk => {
      logger.debug('Received text delta', { requestId, threadId, chunk });
      try {
        bufferMessage(threadId, 'assistant', chunk);
        logger.info('Buffered assistant message chunk', { requestId, threadId });
      } catch (err) {
        logger.error('Error buffering assistant message', { requestId, threadId, error: err.message });
      }
    },
    onEnd: async () => {
      logger.info('OpenAI stream ended, flushing buffer', { requestId, threadId });
      try {
        await flushAll(threadId);
        logger.debug('Flushed buffer on stream end', { requestId, threadId });
      } catch (err) {
        logger.error('Error flushing buffer on end', { requestId, threadId, error: err.message });
      }
      res.write('event: end\ndata:done\n\n');
      res.end();
      logger.debug('SSE connection closed after end event', { requestId, threadId });
    },
    onError: async err => {
      logger.error('OpenAI stream error', { requestId, threadId, error: err.message });
      try {
        await flushAll(threadId);
        logger.debug('Flushed buffer on stream error', { requestId, threadId });
      } catch (flushErr) {
        logger.error('Error flushing buffer on stream error', { requestId, threadId, error: flushErr.message });
      }
      // Send standardized SSE error and close
      sendSSEError(res, err, locale);
      logger.debug('SSE connection closed after error event', { requestId, threadId });
    }
  });

  // Handle client disconnect
  req.on('close', async () => {
    logger.warn('Client disconnected prematurely', { requestId, threadId });
    stream.stop?.();
    try {
      await flushAll(threadId);
      logger.debug('Flushed buffer on client disconnect', { requestId, threadId });
    } catch (err) {
      logger.error('Error flushing buffer on client disconnect', { requestId, threadId, error: err.message });
    }
    res.end();
    logger.debug('SSE connection ended after client disconnect', { requestId, threadId });
  });

  return stream;
}
