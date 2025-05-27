import express from 'express';
import { chatStream, endSession } from '../controllers/chatController.js';
import { createThread }          from '../controllers/threadController.js';
import { addMessage }            from '../controllers/messageController.js';

import { requestTracker } from '../middleware/requestTracker.js';
import { errorLogger, wrapAsync } from '../middleware/errorHandler.js';

const router = express.Router();

// 1) أضف ميدلوير تتبع الطلبات
router.use(requestTracker);

// 2) عرف المسارات مع تغليف wrapAsync
router.post('/chat-stream',    wrapAsync(chatStream));
router.post('/end-session',    wrapAsync(endSession));
router.post('/create-threads', wrapAsync(createThread));
router.post('/create-messages',wrapAsync(addMessage));

// 3) أخيرًا ميدلوير تسجيل الأخطاء
router.use(errorLogger);

export default router;