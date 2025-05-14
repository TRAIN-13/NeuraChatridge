import express from 'express';
import { chatStream, endSession } from '../controllers/chatController.js';

const router = express.Router();

router.post('/chat-stream', chatStream);
router.post('/end-session', endSession);  // لإعادة ضبط الجلسة وإنهاء الثريد

export default router;