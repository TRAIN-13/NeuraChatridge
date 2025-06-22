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
      throw new Error('batchSize must be a positive number');
    }
    if (typeof maxDelay !== 'number' || maxDelay < 0) {
      throw new Error('maxDelay must be a non-negative number');
    }
    if (typeof onFlush !== 'function') {
      throw new Error('onFlush must be a function');
    }
  }

  /**
   * Add item to buffer, schedule flush by size or time
   */
  async add(threadId, item) {
    // item = { author, content, timestampMs }
    if (!this.buffers.has(threadId)) {
      this._initThread(threadId);
    }
  
    // إذا المستخدِم مرّر receivedAt (ms) فاستخدمه، وإلا اقتطع واحد جديد
    const timestampMs = typeof item.receivedAt === 'number'
      ? item.receivedAt
      : Date.now();
    const timestampedItem = {
      author:   item.author,
      content:  item.content,
      timestampMs
    };
    this.buffers.get(threadId).push(timestampedItem);
  
    // إذا وصلنا الحد المطلوب من العناصر، نفّذ الفلاش فوراً
    if (this.buffers.get(threadId).length >= this.batchSize) {
      clearTimeout(this.timers.get(threadId));
      return this._scheduleFlush(threadId);
    }
  
    // وإلا، جدّد المؤقت لتنفيذ الفلاش بعد maxDelay ملّي ثانية
    clearTimeout(this.timers.get(threadId));
    this.timers.set(
      threadId,
      setTimeout(() => this._scheduleFlush(threadId), this.maxDelay)
    );
  }


  _initThread(threadId) {
    this.buffers.set(threadId, []);
    this.locks.set(threadId, false);
    this.pending.set(threadId, new Set());
  }

  async _scheduleFlush(threadId) {
    if (this.locks.get(threadId)) return;
    this.locks.set(threadId, true);
    try {
      await this._flushWithRetry(threadId);
    } finally {
      this.locks.set(threadId, false);
    }
  }

  async _flushWithRetry(threadId, attempt = 1) {
    const items = this._drainBuffer(threadId);
    if (items.length === 0) return;

    const operationId = uuidv4().substring(0, 8);
    this.pending.get(threadId).add(operationId);

    try {
      logger.debug(`Flushing batch ${operationId}`, { threadId, size: items.length });
      await this.onFlush(threadId, items);
      this.pending.get(threadId).delete(operationId);
    } catch (err) {
      logger.error(`Flush failed (attempt ${attempt})`, { threadId, operationId, error: err.message });
      this.pending.get(threadId).delete(operationId);
      if (attempt < this.maxRetries) {
        await this._delay(this.retryDelay * attempt);
        // put back items for retry
        this.buffers.get(threadId).unshift(...items);
        return this._flushWithRetry(threadId, attempt + 1);
      } else {
        logger.error('Permanent flush failure', { threadId, lost: items.length });
        // optionally notify operations team
      }
    }
  }

  _drainBuffer(threadId) {
    const items = this.buffers.get(threadId) || [];
    this.buffers.set(threadId, []);
    return items;
  }

  async flush(threadId) {
    // immediate flush without retry
    if (!this.buffers.has(threadId)) return;
    clearTimeout(this.timers.get(threadId));
    const items = this._drainBuffer(threadId);
    if (items.length === 0) return;
    try {
      await this.onFlush(threadId, items);
    } catch (err) {
      logger.error('Immediate flush failed', { threadId, error: err.message });
    }
  }

  async flushAll() {
    const ids = Array.from(this.buffers.keys());
    for (const threadId of ids) {
      clearTimeout(this.timers.get(threadId));
      await this._scheduleFlush(threadId);
    }
  }

  async gracefulShutdown() {
    await this.flushAll();
    // wait for pending ops
    for (const [threadId, ops] of this.pending) {
      while (ops.size > 0) {
        await this._delay(500);
      }
    }
  }

  _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}