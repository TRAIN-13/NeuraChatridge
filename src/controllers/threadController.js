// src/controllers/threadController.js
import { v4 as uuidv4 } from 'uuid';
import {
  createAIThread,
  aiAddMessage
} from '../services/openaiService.js';
import {
  createFSThread,
  updateThreadTimestamp
} from '../services/threadService.js';
import { bufferMessage as fsAddMessage } from '../services/messageService.js';
import { runThreadStream } from "../services/streamService.js";

/**
 * POST /api/threads
 */
export async function createThread(req, res) {
  try {
    let { user_Id: userId, message } = req.body;
    // To-Do
    // req meta data
    const isGuest = !userId;
    if (isGuest) {
      userId = uuidv4();
    }

    // خدمة OpenAI
    const threadId = await createAIThread();

    // خدمة Firestore
    await createFSThread(userId, threadId);

    // رسالة ابتدائية
    if (message && message.trim()) {
        await aiAddMessage(threadId, message);
        await fsAddMessage(threadId, "user", message);
        await updateThreadTimestamp(threadId);
        // Start stream to FB
        return runThreadStream(threadId, req, res);

    }

    res.json({ userId, threadId, isGuest });
  } catch (err) {
    console.error('createThread error:', err);
    res.status(500).json({ error: err.message });
  }
}
