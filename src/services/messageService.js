// src/services/messageService.js
import { db } from '../utils/firebase.js';
import { collection, writeBatch, doc, serverTimestamp, addDoc } from 'firebase/firestore';
import { BatchBuffer } from './batchService.js';

// يمكنك ضبط هذا على عدد الرسائل التي تريد دفعة واحدة (افتراضي 5)
const ASSISTANT_BATCH_SIZE = parseInt(process.env.ASSISTANT_BATCH_SIZE ?? '5', 10);

async function flushAssistantMessages(threadId, messages) {
  const batch = writeBatch(db);
  const msgsCol = collection(db, `threads/${threadId}/messages`);
  for (const { author, content } of messages) {
    const ref = doc(msgsCol);
    batch.set(ref, { author, content, createdAt: serverTimestamp() });
  }
  await batch.commit();
}

// باتشر خاص بردود المساعد
export const assistantBatcher = new BatchBuffer(ASSISTANT_BATCH_SIZE, flushAssistantMessages);

/**
 * احفظ رسالة العميل فوراً
 */
export async function addMessageInstant(threadId, author, content) {
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('Message content must be a non-empty string');
  }
  const msgsCol = collection(db, `threads/${threadId}/messages`);
  await addDoc(msgsCol, { author, content, createdAt: serverTimestamp() });
}

/**
 * ضف رسالة المساعد إلى الباتشر
 */
export function bufferMessage(threadId, author, content) {
  return assistantBatcher.add(threadId, { author, content });
}

/**
 * إفراغ أي رسائل باقية للمساعد
 */
export async function flushAll(threadId) {
  await assistantBatcher.flushAll(threadId);
}