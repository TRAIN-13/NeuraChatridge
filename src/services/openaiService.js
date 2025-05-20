// src/services/openaiService.js
import OpenAI from 'openai';
import { db } from "../utils/firebase.js";
import { collection, addDoc } from "firebase/firestore";


const { OPENAI_API_KEY, OPENAI_ASSISTANT_ID, DEBUG } = process.env;

// 1. التحقّق من الإعدادات المطلوبة
if (!OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY in environment');
}
if (!OPENAI_ASSISTANT_ID) {
  throw new Error('Missing OPENAI_ASSISTANT_ID in environment');
}

export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const ASSISTANT_ID = OPENAI_ASSISTANT_ID;

/**
 *  إنشاء خيط جديد
 *  @returns {Promise<string>} معرف الخيط
 */
export async function createThread() {
  DEBUG && console.debug("🔄 Creating a new thread...");
  const thread = await openai.beta.threads.create();
  DEBUG && console.debug("🧵 Thread created:", thread.id);
  return thread.id;
}

/**
 *  إضافة رسالة أو مصفوفة رسائل إلى خيط موجود
 *  @param {string} threadId
 *  @param {string|object[]} content - نص واحد أو مصفوفة من { role, content }
 */
export async function addMessage(threadId, content) {
  if (!threadId) {
    throw new Error("threadId is required for addMessage");
  }
  if (!content) {
    throw new Error("No content provided to addMessage");
  }

  // إذا أُرسل مصفوفة رسائل، أرسل كل رسالة على حدة
  if (Array.isArray(content)) {
    for (const msg of content) {
      if (!msg.role || !msg.content) {
        throw new Error("Each message must have a 'role' and 'content'");
      }
      DEBUG && console.debug(`➕ Adding message (${msg.role}) to thread ${threadId}`);
      await openai.beta.threads.messages.create(threadId, {
        role: msg.role,
        content: msg.content
      });
    }
    return;
  }

  // حالة الرسالة المفردة (نص من المستخدم)
  DEBUG && console.debug(`➕ Adding single user message to thread ${threadId}`);
  return await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content
  });
}

/**
 *  تشغيل الاستريم على خيط موجود
 *  @param {string} threadId
 *  @param {object[]} messages - مصفوفة الرسائل الجديدة إن وجدت
 *  @param {{ onTextDelta, onToolCallDelta, onEnd, onError }} callbacks
 */
export function streamThread(threadId, callbacks) {
  if (!threadId) {
    throw new Error("threadId is required for streamThread");
  }

  // 3. تجهيز المعاملات للـstream
  // نمرر فقط assistant_id
  const run = openai.beta.threads.runs.stream(threadId, {
    assistant_id: ASSISTANT_ID
  });

  run.on("textDelta", delta => callbacks.onTextDelta?.(delta.value));
  run.on("toolCallDelta", delta => callbacks.onToolCallDelta?.(delta.value));
  run.on("end",        ()    => callbacks.onEnd?.());
  run.on("error",      err   => callbacks.onError?.(err));

  return run;
}