import express from 'express';
import { requestTracker } from '../middleware/requestTracker.js';
import { errorLogger, wrapAsync } from '../middleware/errorHandler.js';

import { createThread }  from '../controllers/threadController.js';
import { addMessage }    from '../controllers/messageController.js';
import { fetchMessages } from '../controllers/chatController.js';
import multer from 'multer';

const router = express.Router();
const upload = multer(); // يستخدم الذاكرة مؤقتًا

// 1) تعقب الطلبات
router.use(requestTracker);

// 2) تعريف المسارات
router.post('/create-threads',  wrapAsync(createThread));
router.post('/create-messages',upload.single('image') , wrapAsync(addMessage));
router.post('/fetch-messages', wrapAsync(fetchMessages));

// في src/routes/chatRoutes.js
router.get('/ping', (req, res) => res.send('pong'));


// 3) تسجيل الأخطاء
router.use(errorLogger);

export default router;