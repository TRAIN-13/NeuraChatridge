// ./src/routes/chatRoutes.js
import express from 'express';
import { requestTracker } from '../middleware/requestTracker.js';
import { wrapAsync } from '../middleware/errorHandler.js';

import { validate, createThreadSchema, addMessageSchema, fetchMessagesSchema } from '../utils/validation.js';

import { createThread }  from '../controllers/threadController.js';
import { addMessage }    from '../controllers/messageController.js';
import { fetchMessages } from '../controllers/chatController.js';
import multer from 'multer';

const router = express.Router();
const upload = multer(); // يستخدم الذاكرة مؤقتًا

// 1) تعقب الطلبات
router.use(requestTracker);

// 2) تعريف المسارات
router.post('/create-threads',
    validate(createThreadSchema),
    wrapAsync(createThread)
);
router.post('/create-messages',
    upload.single('image'),
    validate(addMessageSchema),
    wrapAsync(addMessage)
);
router.post('/fetch-messages',
    validate(fetchMessagesSchema),
    wrapAsync(fetchMessages)
);

// في src/routes/chatRoutes.js
router.get('/ping', (req, res) => res.send('pong'));


export default router;