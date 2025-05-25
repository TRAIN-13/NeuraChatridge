import express from 'express';
import { chatStream, endSession } from '../controllers/chatController.js';

const router = express.Router();

router.post('/chat-stream', chatStream);
router.post('/end-session', endSession);  // لإعادة ضبط الجلسة وإنهاء الثريد

/*  To-Do
    Post Create threads "end point"
      request:
              {
                userId: nullable,
                message: required,
                metaData: nullable
              }
      respond:
              {
                userId: From Requested or Generate new id,
                treadId: required,
                isGuset: true if userId empty from req, else false,
              }
*/

/*  To-Do
    Post Create messages "end point"
      request:
              {
                userId: required,
                treadId: required,
                message: required,
                metaData: nullable
              }
      respond:
              {
                userId: From Requested,
                treadId: required,
                succsess: true
              }
*/


export default router;