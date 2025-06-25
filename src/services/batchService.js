// src/services/batchService.js
import logger from '../utils/logger.js';
import { writeBatch, doc, collection } from 'firebase/firestore';
import { formatTimestamp } from '../utils/dateUtils.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * ResilientBatcher: unified batch-flush utility with size, time, retry, and graceful shutdown.
 */
export class ResilientBatcher {
  /**
   * @param {Object} config
   * @param {number} config.batchSize      - عدد الرسائل قبل الفلاش
   * @param {number} config.maxDelay       - أقصى تأخير (ms) قبل الفلاش
   * @param {function} config.onFlush      - دالة التنفيذ عند الفلاش
   * @param {number} [config.maxRetries]   - أقصى عدد محاولات عند الفشل
   * @param {number} [config.retryDelay]   - تأخير أساسي (ms) لإعادة المحاولة
   */
  constructor({ batchSize, maxDelay, onFlush, maxRetries = 3, retryDelay = 1000 }) {
    logger.debug('ResilientBatcher: initializing', { batchSize, maxDelay, maxRetries, retryDelay });
    this._validateConfig(batchSize, maxDelay, onFlush);
    this.batchSize = batchSize;
    this.maxDelay = maxDelay;
    this.onFlush = onFlush;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.buffers = new Map();        // threadId -> Array<item>
    this.timers = new Map();         // threadId -> Timeout
    this.locks = new Map();          // threadId -> boolean
    this.pending = new Map();        // threadId -> Set<operationId>
  }

  _validateConfig(batchSize, maxDelay, onFlush) {
    if (typeof batchSize !== 'number' || batchSize < 1) {
      logger.error('ResilientBatcher: invalid batchSize', { batchSize });
      throw new Error('batchSize must be a positive number');
    }
    if (typeof maxDelay !== 'number' || maxDelay < 0) {
      logger.error('ResilientBatcher: invalid maxDelay', { maxDelay });
      throw new Error('maxDelay must be a non-negative number');
    }
    if (typeof onFlush !== 'function') {
      logger.error('ResilientBatcher: invalid onFlush callback');
      throw new Error('onFlush must be a function');
    }
  }

  /**
   * Add item to buffer, schedule flush by size or time
   */
  async add(threadId, item) {
    logger.debug('ResilientBatcher.add: called', { threadId, item });
    if (!this.buffers.has(threadId)) {
      this._initThread(threadId);
    }

    const timestampMs = typeof item.receivedAt === 'number'
      ? item.receivedAt
      : Date.now();
    const timestampedItem = { ...item, timestampMs };
    this.buffers.get(threadId).push(timestampedItem);

    const bufferLength = this.buffers.get(threadId).length;
    logger.info('ResilientBatcher.add: buffered item', { threadId, bufferLength });

    if (bufferLength >= this.batchSize) {
      clearTimeout(this.timers.get(threadId));
      return this._scheduleFlush(threadId);
    }

    clearTimeout(this.timers.get(threadId));
    this.timers.set(
      threadId,
      setTimeout(() => this._scheduleFlush(threadId), this.maxDelay)
    );
    logger.debug('ResilientBatcher.add: scheduled flush by timeout', { threadId, delay: this.maxDelay });
  }

  _initThread(threadId) {
    logger.debug('ResilientBatcher._initThread: initializing thread buffers', { threadId });
    this.buffers.set(threadId, []);
    this.locks.set(threadId, false);
    this.pending.set(threadId, new Set());
  }

  async _scheduleFlush(threadId) {
    if (this.locks.get(threadId)) {
      logger.debug('ResilientBatcher._scheduleFlush: lock active, aborting', { threadId });
      return;
    }
    logger.debug('ResilientBatcher._scheduleFlush: acquiring lock', { threadId });
    this.locks.set(threadId, true);
    try {
      await this._flushWithRetry(threadId);
    } finally {
      this.locks.set(threadId, false);
      logger.debug('ResilientBatcher._scheduleFlush: released lock', { threadId });
    }
  }

  async _flushWithRetry(threadId, attempt = 1) {
    const items = this._drainBuffer(threadId);
    if (items.length === 0) {
      logger.debug('ResilientBatcher._flushWithRetry: no items to flush', { threadId });
      return;
    }

    const operationId = uuidv4().substring(0, 8);
    this.pending.get(threadId).add(operationId);
    logger.info('ResilientBatcher._flushWithRetry: starting flush', { threadId, operationId, attempt, size: items.length });

    try {
      await this.onFlush(threadId, items);
      this.pending.get(threadId).delete(operationId);
      logger.info('ResilientBatcher._flushWithRetry: flush succeeded', { threadId, operationId });
    } catch (err) {
      this.pending.get(threadId).delete(operationId);
      logger.error('ResilientBatcher._flushWithRetry: flush failed', { threadId, operationId, attempt, error: err.message });
      if (attempt < this.maxRetries) {
        const delay = this.retryDelay * attempt;
        logger.warn('ResilientBatcher._flushWithRetry: retrying flush', { threadId, operationId, nextAttempt: attempt + 1, delay });
        await this._delay(delay);
        this.buffers.get(threadId).unshift(...items);
        return this._flushWithRetry(threadId, attempt + 1);
      } else {
        logger.critical('ResilientBatcher._flushWithRetry: permanent flush failure', { threadId, operationId, lost: items.length });
      }
    }
  }

  _drainBuffer(threadId) {
    const items = this.buffers.get(threadId) || [];
    logger.debug('ResilientBatcher._drainBuffer: draining items', { threadId, count: items.length });
    this.buffers.set(threadId, []);
    return items;
  }

  async flush(threadId) {
    logger.debug('ResilientBatcher.flush: immediate flush requested', { threadId });
    if (!this.buffers.has(threadId)) {
      logger.debug('ResilientBatcher.flush: no buffer for thread', { threadId });
      return;
    }
    clearTimeout(this.timers.get(threadId));
    const items = this._drainBuffer(threadId);
    if (items.length === 0) {
      logger.debug('ResilientBatcher.flush: no items to flush', { threadId });
      return;
    }
    try {
      logger.info('ResilientBatcher.flush: executing immediate flush', { threadId, size: items.length });
      await this.onFlush(threadId, items);
      logger.info('ResilientBatcher.flush: immediate flush succeeded', { threadId });
    } catch (err) {
      logger.error('ResilientBatcher.flush: immediate flush failed', { threadId, error: err.message });
    }
  }

  async flushAll() {
    logger.debug('ResilientBatcher.flushAll: flushing all buffers', {});
    const ids = Array.from(this.buffers.keys());
    for (const threadId of ids) {
      clearTimeout(this.timers.get(threadId));
      await this._scheduleFlush(threadId);
    }
    logger.info('ResilientBatcher.flushAll: all flushes completed', { threads: ids.length });
  }

  async gracefulShutdown() {
    logger.info('ResilientBatcher.gracefulShutdown: initiating shutdown', {});
    await this.flushAll();
    for (const [threadId, ops] of this.pending) {
      while (ops.size > 0) {
        logger.debug('ResilientBatcher.gracefulShutdown: waiting for pending ops', { threadId, pending: ops.size });
        await this._delay(500);
      }
    }
    logger.info('ResilientBatcher.gracefulShutdown: shutdown complete', {});
  }

  _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
