/* src/services/batchService.js */
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';


export class BatchBuffer {
  constructor(batchSize, onFlush, options = {}) {
    this.validateInputs(batchSize, onFlush);
    
    this.batchSize = batchSize;
    this.onFlush = onFlush;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.buffers = new Map();
    this.flushingLocks = new Map();
    this.pendingOperations = new Map();
  }

  validateInputs(batchSize, onFlush) {
    if (typeof batchSize !== 'number' || batchSize < 1) {
      throw new Error('batchSize must be a positive integer');
    }
    if (typeof onFlush !== 'function') {
      throw new Error('onFlush must be a function');
    }
  }

  async add(threadId, item) {
    if (!this.buffers.has(threadId)) {
      this.initializeThreadBuffer(threadId);
    }

    const buffer = this.buffers.get(threadId);
    buffer.push(item);

    if (buffer.length >= this.batchSize) {
      return this.scheduleFlush(threadId);
    }
  }

  initializeThreadBuffer(threadId) {
    this.buffers.set(threadId, []);
    this.flushingLocks.set(threadId, false);
    this.pendingOperations.set(threadId, new Set());
  }

  async scheduleFlush(threadId) {
    if (this.flushingLocks.get(threadId)) return;

    this.flushingLocks.set(threadId, true);
    try {
      await this.flushWithRetry(threadId);
    } finally {
      this.flushingLocks.set(threadId, false);
    }
  }

  async flushWithRetry(threadId, attempt = 1) {
    const items = this.getAndClearBuffer(threadId);
    if (items.length === 0) return;

    try {
      await this.executeFlush(threadId, items);
    } catch (error) {
      await this.handleFlushError(error, threadId, items, attempt);
    }
  }

  async executeFlush(threadId, items) {
    const operationId = uuidv4().substring(0, 8);
    this.pendingOperations.get(threadId).add(operationId);

    logger.debug(`Flushing batch for thread ${threadId}`, {
      operationId,
      batchSize: items.length
    });

    await this.onFlush(threadId, items);
    
    this.pendingOperations.get(threadId).delete(operationId);
  }

  async handleFlushError(error, threadId, items, attempt) {
    logger.error(`Batch flush failed (attempt ${attempt})`, {
      threadId,
      error: error.message,
      remainingItems: items.length
    });

    if (attempt <= this.maxRetries) {
      await this.retryFlush(threadId, items, attempt);
    } else {
      await this.handlePermanentFailure(threadId, items);
    }
  }

  async retryFlush(threadId, items, attempt) {
    await new Promise(r => setTimeout(r, this.retryDelay * attempt));
    this.buffers.get(threadId).unshift(...items);
    return this.flushWithRetry(threadId, attempt + 1);
  }

  async handlePermanentFailure(threadId, items) {
    logger.error('Permanent batch flush failure', {
      threadId,
      lostItems: items.length
    });
    // يمكن إضافة إشعار للفريق الفني هنا
  }

  async flush(threadId) {
    const items = this.getAndClearBuffer(threadId);
    if (items.length > 0) {
      await this.executeFlush(threadId, items);
    }
  }

  getAndClearBuffer(threadId) {
    const items = this.buffers.get(threadId) || [];
    this.buffers.set(threadId, []);
    return items;
  }

  async flushAll(threadId) {
    while (this.pendingOperations.get(threadId)?.size > 0) {
      await new Promise(r => setTimeout(r, 500));
    }
    await this.flush(threadId);
  }

  async gracefulShutdown() {
    for (const threadId of this.buffers.keys()) {
      await this.flushAll(threadId);
    }
  }
}