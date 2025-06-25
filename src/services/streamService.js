// src/services/streamService.js
import logger from '../utils/logger.js';
import { streamThread as openaiStream } from './openaiService.js';
import { bufferMessage, flushAll } from './messageService.js';

/**
 * تبدأ ستريم SSE على ثريد مع OpenAI وترفع الحزم إلى Firestore.
 *
 * @param {string} threadId
 * @param {object} req      - كائن Express request
 * @param {object} res      - كائن Express response
 */
export function runThreadStream(threadId, req, res) {
  logger.debug('Entering runThreadStream', { requestId: req.requestId, threadId });

  const stream = openaiStream(threadId, {
    onTextDelta: chunk => {
      logger.debug('Received text delta from OpenAI', { requestId: req.requestId, threadId, chunk });
      try {
        bufferMessage(threadId, 'assistant', chunk);
        logger.info('Buffered assistant message chunk', { requestId: req.requestId, threadId });
      } catch (err) {
        logger.error('Buffer error (ignored)', { requestId: req.requestId, threadId, error: err.message });
      }
    },
    onEnd: async () => {
      logger.info('OpenAI stream ended, flushing buffer', { requestId: req.requestId, threadId });
      try {
        await flushAll(threadId);
        logger.debug('Buffer flushed on stream end', { requestId: req.requestId, threadId });
      } catch (err) {
        logger.error('Flush onEnd error', { requestId: req.requestId, threadId, error: err.message });
      }
      res.write('event: end\ndata: done\n\n');
      res.end();
      logger.debug('SSE connection closed after end event', { requestId: req.requestId, threadId });
    },
    onError: async err => {
      logger.error('Stream error', { requestId: req.requestId, threadId, error: err.message });
      try {
        await flushAll(threadId);
        logger.debug('Buffer flushed on stream error', { requestId: req.requestId, threadId });
      } catch (flushErr) {
        logger.error('Flush onError error', { requestId: req.requestId, threadId, error: flushErr.message });
      }
      delete req.session.threadId;
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
      logger.debug('SSE connection closed after error event', { requestId: req.requestId, threadId });
    }
  });

  // رصد قطع اتصال العميل لتنظيف الموارد فوراً
  req.on('close', async () => {
    logger.warn('Client disconnected prematurely', { requestId: req.requestId, threadId });
    stream.stop?.();
    try {
      await flushAll(threadId);
      logger.debug('Buffer flushed on client disconnect', { requestId: req.requestId, threadId });
    } catch (err) {
      logger.error('Flush on client disconnect error', { requestId: req.requestId, threadId, error: err.message });
    }
    res.end();
    logger.debug('SSE connection ended after client disconnect', { requestId: req.requestId, threadId });
  });

  return stream;
}
