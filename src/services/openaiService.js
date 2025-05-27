// src/services/openaiService.js
import OpenAI from 'openai';
//import { db } from "../utils/firebase.js";
//import { collection, addDoc } from "firebase/firestore";


const { OPENAI_API_KEY, OPENAI_ASSISTANT_ID, DEBUG } = process.env;

// 1. Check for the requuird setting
if (!OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY in environment');
}
if (!OPENAI_ASSISTANT_ID) {
  throw new Error('Missing OPENAI_ASSISTANT_ID in environment');
}

export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const ASSISTANT_ID = OPENAI_ASSISTANT_ID;

/**
 *  create new thread
 *  @returns {Promise<string>} threadId
 */
export async function createAIThread() {
  DEBUG && console.debug("🔄 Creating a new thread...");
  const thread = await openai.beta.threads.create();
  DEBUG && console.debug("🧵 Thread created:", thread.id);
  return thread.id;
}

/**
 *  Add messages or array from it to the thread
 *  @param {string} threadId
 *  @param {string|object[]} content - 1 text or array { role, content }
 */
 
export async function aiAddMessage(threadId, content) {
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
 *  run stream on thread existed
 *  @param {string} threadId
 *  @param {object[]} messages - array of messages if exits
 *  @param {{ onTextDelta, onToolCallDelta, onEnd, onError }} callbacks
 */
export function streamThread(threadId, callbacks) {
  if (!threadId) throw new Error("threadId is required for streamThread");

  const run = openai.beta.threads.runs.stream(threadId, {
    assistant_id: OPENAI_ASSISTANT_ID,
  });

  run.on('textCreated', () => console.log('Start generate text'));

  run.on("textDelta", delta => {
    // 1) تأكد من وجود محتوى
    if (delta?.content && Array.isArray(delta.content)) {
      // 2) مر على كل جزء نصي
      for (const part of delta.content) {
        if (part.type === "text" && part.text?.value) {
          callbacks.onTextDelta?.(part.text.value);
        }
      }
    }
  });
  
  run.on("textDelta", chunk => {
  callbacks.onTextDelta?.(chunk.value)
});

  run.on("toolCallDelta", delta => callbacks.onToolCallDelta?.(delta));
  run.on("end",        ()    => callbacks.onEnd?.(console.log("stream end\n\n")));
  run.on("error",      err   => callbacks.onError?.(err));

  return run;
}