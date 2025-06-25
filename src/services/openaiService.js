// src/services/openaiService.js
import logger from '../utils/logger.js';
import OpenAI from 'openai';

import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 3000;

const { OPENAI_API_KEY, OPENAI_ASSISTANT_ID, DEBUG } = process.env;

// 1. Check for the required settings
if (!OPENAI_API_KEY) {
  logger.error('Missing OPENAI_API_KEY in environment');
  throw new Error('Missing OPENAI_API_KEY in environment');
}
if (!OPENAI_ASSISTANT_ID) {
  logger.error('Missing OPENAI_ASSISTANT_ID in environment');
  throw new Error('Missing OPENAI_ASSISTANT_ID in environment');
}

export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const ASSISTANT_ID = OPENAI_ASSISTANT_ID;

/**
 * Create a new thread
 * @returns {Promise<string>} threadId
 */
export async function createAIThread() {
  logger.debug('createAIThread: Starting thread creation');
  try {
    const thread = await openai.beta.threads.create();
    logger.info('createAIThread: Thread created', { threadId: thread.id });
    return thread.id;
  } catch (err) {
    logger.error('createAIThread: Failed to create thread', { error: err.message });
    throw err;
  }
}

/**
 * @typedef {Object} PayloadSegment
 * @property {'text'|'image_url'} type
 * @property {string} [text]
 * @property {{ url: string }} [image_url]
 */
/**
 * @typedef {Object} AssistantPayload
 * @property {'user'|'assistant'} role
 * @property {PayloadSegment[]} content
 */

/**
 * Add a message or an array of messages to the thread
 * @param {string} threadId
 * @param {AssistantPayload} payload
 */
export async function aiAddMessage(threadId, payload) {
  const context = { threadId };
  logger.debug('aiAddMessage: Entering', { ...context, payloadSummary: { role: payload.role, segments: payload.content.length } });
  if (!threadId) {
    logger.error('aiAddMessage: Missing threadId');
    throw new Error('threadId is required for addMessage');
  }
  if (!payload || !Array.isArray(payload.content) || !payload.role) {
    logger.error('aiAddMessage: Invalid AssistantPayload', { payload });
    throw new Error('Invalid AssistantPayload: must include role and content array');
  }

  const hasImage = payload.content.some(item => item.type === 'image_url');
  const textLength = payload.content.find(item => item.type === 'text')?.text?.length || 0;
  logger.info('aiAddMessage: Sending payload to OpenAI', { ...context, role: payload.role, textLength, hasImage });

  try {
    const response = await openai.beta.threads.messages.create(threadId, {
      role: payload.role,
      content: payload.content
    });
    logger.info('aiAddMessage: OpenAI responded successfully', { ...context });
    return response;
  } catch (err) {
    logger.error('aiAddMessage: OpenAI request failed', { ...context, error: err.message });
    throw err;
  }
}

/**
 * Stream a thread via SSE
 * @param {string} threadId
 * @param {{ onTextDelta: function, onToolCallDelta: function, onEnd: function, onError: function }} callbacks
 */
export function streamThread(threadId, callbacks) {
  const context = { threadId };
  logger.debug('streamThread: Starting stream', context);
  if (!threadId) {
    logger.error('streamThread: Missing threadId');
    throw new Error('threadId is required for streamThread');
  }

  const run = openai.beta.threads.runs.stream(threadId, {
    assistant_id: ASSISTANT_ID,
  });

  run.on('textCreated', () => {
    logger.debug('streamThread: textCreated event');
  });

  run.on('textDelta', delta => {
    logger.debug('streamThread: textDelta event received', context);
    if (Array.isArray(delta.content)) {
      for (const part of delta.content) {
        if (part.type === 'text' && part.text?.value) {
          callbacks.onTextDelta?.(part.text.value);
          logger.debug('streamThread: onTextDelta callback executed', context);
        }
      }
    } else if (typeof delta.value === 'string') {
      callbacks.onTextDelta?.(delta.value);
      logger.debug('streamThread: onTextDelta callback executed', context);
    }
  });

  run.on('toolCallDelta', delta => {
    logger.debug('streamThread: toolCallDelta event', context);
    callbacks.onToolCallDelta?.(delta);
  });

  run.on('end', () => {
    logger.info('streamThread: end event - stream finished', context);
    callbacks.onEnd?.();
  });

  run.on('error', err => {
    logger.error('streamThread: error event', { ...context, error: err.message });
    callbacks.onError?.(err);
  });

  return run;
}
