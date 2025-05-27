// src/services/messageService.js
import { db } from '../utils/firebase.js';
import { collection, writeBatch, doc, serverTimestamp, addDoc } from 'firebase/firestore';
import { ResilientBatcher } from './batchService.js';

/**
 * دالة onFlush: تكتب دفعة الرسائل في Firestore
 */
async function flushAssistantMessages(threadId, messages) {
  const batch = writeBatch(db);
  const msgsCol = collection(db, `threads/${threadId}/messages`);
  
  for (const { author, content } of messages) {
    const ref = doc(msgsCol);
    batch.set(ref, { author, content, createdAt: serverTimestamp() });
  }
  
  await batch.commit();
}

/**
 * Batcher لردود المساعد
 */
export const assistantBatcher = new ResilientBatcher({
  batchSize:  parseInt(process.env.BATCH_SIZE       || '5',    10),
  maxDelay:   parseInt(process.env.BATCH_MAX_DELAY  || '2000', 10),
  onFlush:    flushAssistantMessages,
  maxRetries: parseInt(process.env.MAX_BATCH_RETRIES || '3',  10),
  retryDelay: parseInt(process.env.BATCH_RETRY_DELAY  || '1000', 10)
});

/**
 * احفظ رسالة العميل فوراً في Firestore
 */
export async function addMessageInstant(threadId, author, content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Message content must be a non-empty string');
  }
  const msgsCol = collection(db, `threads/${threadId}/messages`);
  await addDoc(msgsCol, { author, content, createdAt: serverTimestamp() });
}

/**
 * أضف رسالة المساعد إلى البافر لإرسالها دفعة لاحقاً
 */
export function bufferMessage(threadId, author, content) {
  return assistantBatcher.add(threadId, { author, content });
}

/**
 * إفراغ أي رسائل متبقية في البافر (مثلاً عند نهاية الجلسة)
 */
export async function flushAll(threadId) {
  await assistantBatcher.flushAll(threadId);
}
