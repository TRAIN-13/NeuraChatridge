// src/services/openaiService.js
import OpenAI from 'openai';

const { OPENAI_API_KEY, OPENAI_ASSISTANT_ID, DEBUG } = process.env;

// 1. Check for the required settings
if (!OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY in environment');
}
if (!OPENAI_ASSISTANT_ID) {
  throw new Error('Missing OPENAI_ASSISTANT_ID in environment');
}

export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const ASSISTANT_ID = OPENAI_ASSISTANT_ID;

/**
 * Create a new thread
 * @returns {Promise<string>} threadId
 */
export async function createAIThread() {
  DEBUG && console.debug('🔄 Creating a new thread...');
  const thread = await openai.beta.threads.create();
  DEBUG && console.debug('🧵 Thread created:', thread.id);
  return thread.id;
}

/**
 * Add a message or an array of messages to the thread
 * @param {string} threadId
 * @param {string|object[]} content - A single text or an array of { role, content }
 */
export async function aiAddMessage(threadId, content) {
  if (!threadId) {
    throw new Error('threadId is required for addMessage');
  }
  if (!content) {
    throw new Error('No content provided to addMessage');
  }

  // If an array of messages is passed, send each one
  if (Array.isArray(content)) {
    for (const msg of content) {
      if (!msg.role || !msg.content) {
        throw new Error("Each message must have a 'role' and 'content'");
      }
      DEBUG && console.debug(`➕ Adding message (${msg.role}) to thread ${threadId}`);
      await openai.beta.threads.messages.create(threadId, {
        role: msg.role,
        content: msg.content,
      });
    }
    return;
  }

  // Single message (user text)
  DEBUG && console.debug(`➕ Adding single user message to thread ${threadId}`);
  return await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content,
  });
}

/**
 * Stream a thread via SSE
 * @param {string} threadId
 * @param {{ onTextDelta: function, onToolCallDelta: function, onEnd: function, onError: function }} callbacks
 */
export function streamThread(threadId, callbacks) {
  if (!threadId) throw new Error('threadId is required for streamThread');

  const run = openai.beta.threads.runs.stream(threadId, {
    assistant_id: ASSISTANT_ID,
  });

  run.on('textCreated', () => console.log('Start generating text'));

  // Single listener for textDelta: handles both array and direct-value cases
  run.on('textDelta', delta => {
    if (Array.isArray(delta.content)) {
      for (const part of delta.content) {
        if (part.type === 'text' && part.text?.value) {
          callbacks.onTextDelta?.(part.text.value);
        }
      }
    } else if (typeof delta.value === 'string') {
      callbacks.onTextDelta?.(delta.value);
    }
  });

  run.on('toolCallDelta', delta => callbacks.onToolCallDelta?.(delta));
  run.on('end', () => {
    console.log('stream end');
    callbacks.onEnd?.();
  });
  run.on('error', err => callbacks.onError?.(err));

  return run;
}
