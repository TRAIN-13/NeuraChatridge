import express from 'express';
import { chatStream, endSession } from '../controllers/chatController.js';
import { createThread } from '../controllers/threadController.js';
import { addMessage } from '../controllers/messageController.js';

const router = express.Router();

router.post('/chat-stream', chatStream);

router.post('/end-session', endSession); 

router.post('/create-threads', createThread)

router.post('/create-messages', addMessage);

export default router;