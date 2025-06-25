// src/controllers/chatController.js
import logger from '../utils/logger.js';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';
import { sanitizeError } from '../utils/errorUtils.js';

/**
 * يعيد جميع الرسائل في thread واحد، بعد التحقق من صلاحية userId.
 * POST /api/fetch-messages
 */
export async function fetchMessages(req, res) {
    const { requestId } = req;
    const startTime = Date.now();
    logger.debug('Entering fetchMessages', { requestId, path: req.originalUrl, method: req.method });
    try {
        // 1) التحقق من المدخلات
        const { threadId, userId } = req.body;
        logger.debug('Validating fetch input', { requestId, threadId, userId });
        validateFetchInput(threadId, userId);
        logger.info('Fetch input validated', { requestId, threadId, userId });

        // 2) جلب بيانات الثريد
        logger.debug('Fetching thread document', { requestId, threadId });
        const threadData = await getThreadData(threadId);
        logger.info('Thread document retrieved', { requestId, threadId, userId: threadData.userId });

        // 3) التحقق من الملكية
        logger.debug('Verifying thread ownership', { requestId, ownerId: threadData.userId, userId });
        verifyOwnership(threadData.userId, userId);
        logger.info('Thread ownership verified', { requestId, threadId });

        // 4) جلب الرسائل
        logger.debug('Retrieving and formatting messages', { requestId, threadId });
        const messages = await retrieveAndFormatMessages(threadId);
        logger.info('Messages retrieved', { requestId, threadId, count: messages.length });

        // 5) إرسال الاستجابة
        logger.debug('Sending response with messages', { requestId, threadId });
        return res.status(200).json({ messages });

    } catch (err) {
        // تسجيل الخطأ
        logger.error('Error in fetchMessages', {
            requestId,
            path: req.originalUrl,
            error: err.message,
            stack: err.stack
        });
        const safe = sanitizeError(err);
        const status = err.statusCode || 500;
        logger.debug('Sending error response', { requestId, status, code: safe.code });
        return res.status(status).json({ error: safe });
    } finally {
        const duration = Date.now() - startTime;
        logger.info('fetchMessages completed', { requestId, duration: `${duration}ms` });
    }
}

/**
 * يتأكد من أن threadId و userId مرّرا في الجسم
 */
function validateFetchInput(threadId, userId) {
    if (!threadId || !userId) {
        const err = new Error('threadId and userId are required');
        err.statusCode = 400;
        logger.warn('Validation failed: missing threadId or userId', { threadId, userId });
        throw err;
    }
}

/**
 * يجيب بيانات الثريد أو يرمي 404 لو لم يجد
 */
async function getThreadData(threadId) {
    logger.debug('getThreadData: constructing doc reference', { threadId });
    const ref  = doc(db, 'threads', threadId);
    logger.debug('getThreadData: fetching document snapshot', { threadId });
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        const err = new Error('Thread not found');
        err.statusCode = 404;
        logger.warn('Thread document not found', { threadId });
        throw err;
    }
    return snap.data();
}

/**
 * يتحقق من أن صاحب الثريد يطابق الـ userId
 */
function verifyOwnership(ownerId, userId) {
    if (ownerId && ownerId !== userId) {
        const err = new Error('Forbidden');
        err.statusCode = 403;
        logger.warn('Ownership verification failed', { ownerId, userId });
        throw err;
    }
}

/**
 * يجلب الرسائل من الفرعية ويطبّق عليها التهيئة والترتيب
 */
async function retrieveAndFormatMessages(threadId) {
    logger.debug('retrieveAndFormatMessages: setting up collection ref', { threadId });
    const msgsRef = collection(db, 'threads', threadId, 'messages');
    logger.debug('retrieveAndFormatMessages: executing getDocs', { threadId });
    const snapshot = await getDocs(msgsRef);
    logger.debug('retrieveAndFormatMessages: mapping and sorting docs', { threadId });

    return snapshot.docs
        .map(docSnap => mapDocToMessage(docSnap.data()))
        .sort((a, b) => a.receivedAt - b.receivedAt);
 }

/**
 * يحول كائن Firestore إلى نموذج رسالة جاهز للإرسال
 */
function mapDocToMessage(data) {
  logger.debug('mapDocToMessage: mapping Firestore data', { seqId: data.seqId });
  const ts = data.receivedAt;
  const receivedAt = (ts && typeof ts.toMillis === 'function')
    ? ts.toMillis()
    : (typeof ts === 'number' ? ts : Date.now());

  const message = {
    seqId:      data.seqId,
    author:     data.author ?? 'assistant',
    content:    { text: data.content.text, imageUrl: data.content.imageUrl ?? null },
    createdAt:  data.createdAt,
    receivedAt
  };
  logger.debug('mapDocToMessage: mapped message', { seqId: message.seqId, receivedAt });
  return message;
}