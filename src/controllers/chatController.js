// src/controllers/chatController.js
import {
  createAIThread,
  aiAddMessage
} from "../services/openaiService.js";

import {
  createFSThread,
  updateThreadTimestamp
} from "../services/threadService.js";

import {
  bufferMessage,
} from "../services/messageService.js";

import { runThreadStream } from "../services/streamService.js";


export async function chatStream(req, res) {
  // 1. Setup SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders?.();

  try {
    // 2. Check content of body
    const { content } = req.body;
    if (!Array.isArray(content)) {
      return res.status(400).json({ error: "Content must be an array of MessageContent blocks" });
    }

    // 3. merge incoming texts into 1 text to send it to assistant
    const contentText = content
      .filter(c => typeof c.text === 'string')
      .map(c => c.text)
      .join('\n');

    // 4. Get the threadId from the session or create if null
    let threadId = req.session.threadId;
    if (!threadId) {
      threadId = await createAIThread();
      req.session.threadId = threadId;
      console.log(`🆕 New thread created: ${threadId}`);

      // 2) Create ( threadId ) in Firestore
      req.session.userId = '20';
      await createFSThread(req.session.userId, threadId);
      console.log(`🆕 New FS thread created: ${threadId}`);
    }

    // 5. Add user message to AI thread and to buffer
    //await aiAddMessage(threadId, contentText);
    const addRes = await aiAddMessage(threadId, contentText);
    console.log("🔄 aiAddMessage response:", addRes);
    console.log("🔜 Starting streamThread for", threadId);
    await bufferMessage(threadId, "user", contentText);
    updateThreadTimestamp(threadId);

    // 6. Run reusable stream
    return runThreadStream(threadId, req, res);
    

  } catch (err) {
    console.error("Controller error:", err);
    // فلش ما تبقى قبل الخروج من الدالة
    if (req.session.threadId) {
      await flushAll(req.session.threadId);
      delete req.session.threadId;
    }
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
}

export async function endSession(req, res) {
  const threadId = req.session.threadId;
  // ارسال أي رسائل متبقية قبل إنهاء الجلسة
  if (threadId) {
    try {
      await flushAll(threadId);
    } catch (e) {
      console.warn("Failed flushing on endSession:", e);
    }
  }

  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: "Failed to end session" });
    }
    res.json({ message: "Session ended successfully" });
  });
}