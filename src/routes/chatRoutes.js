import express from 'express';
import { chatStream, endSession } from '../controllers/chatController.js';
import { createThread } from '../controllers/threadController.js';
import { addMessage } from '../controllers/messageController.js';

const router = express.Router();

router.post('/chat-stream', chatStream);
router.post('/end-session', endSession); 


router.post('/create-threads', createThread)
/*  To-Do
    Post Create threads "end point"
      request:
              {
                user-Id: nullable,
                message: required,
                meta-Data: nullable
              }
      respond:
              {
                user-Id: From Requested or Generate new id,
                tread-Id: required,
                is-Guset: true if userId empty from req, else false,
              }
*/

// New endpoint: إضافة رسالة (user → OpenAI thread + Firestore)
router.post('/create-messages', addMessage);


/*  To-Do
    Post Create messages "end point"
      request:
              {
                user-Id: required,
                tread-Id: required,
                message: required,
                meta-Data: nullable
              }
      respond:
              {
                user-Id: From Requested,
                tread-Id: required,
                succsess: true
              }
*/


export default router;